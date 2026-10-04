"""Prompt/schema regressions and optional live classification checks.

Unit tests inspect the real provider request and validation; they do not claim to
measure a mocked model's language understanding. Opt into live checks with
CIVICOPS_RUN_LIVE_AI_TESTS=1 in an environment containing GROQ_API_KEY.
"""
import json
import os
import logging
from types import SimpleNamespace

import pytest
import httpx
from groq import APIStatusError
from pydantic import ValidationError

from backend.models.common import CategoryEnum
from backend.services.ai_intake import AIIntakeService, IntakeExtraction


CLASSIFICATION_CASES = [
    ("school k samny gutter overflow ho raha hy", "SEWERAGE_DRAINAGE"),
    ("gali mein 3 din se kachra nahi uthaya", "WASTE_SANITATION"),
    ("main road ki street lights band hain", "STREET_LIGHTING"),
]


@pytest.fixture
def service(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    instance = AIIntakeService()
    instance.model = "openai/gpt-oss-120b"
    monkeypatch.setattr("backend.services.ai_intake.time.sleep", lambda _: None)
    return instance


def provider(service, contents):
    requests = []
    outputs = iter(contents)

    def create(**kwargs):
        requests.append(kwargs)
        return SimpleNamespace(choices=[SimpleNamespace(
            message=SimpleNamespace(content=next(outputs)))])

    service.client = SimpleNamespace(chat=SimpleNamespace(
        completions=SimpleNamespace(create=create)))
    return requests


def extraction(category):
    return json.dumps({"category": category, "summary": "Reported civic problem",
                       "reported_urgency": "Medium", "is_civic_issue": True,
                       "injection_suspected": False})


@pytest.mark.parametrize("report,expected", CLASSIFICATION_CASES)
def test_roman_urdu_prompt_and_validated_output(service, report, expected):
    requests = provider(service, [extraction(expected)])
    result = service.call_structured(report, IntakeExtraction)
    assert result["status"] == "success"
    assert result["data"].category is CategoryEnum(expected)
    request = requests[0]
    assert request["messages"][1] == {"role": "user", "content": report}
    guidance = request["messages"][0]["content"]
    assert f"{report} => {expected}" in guidance
    assert all(category.value in guidance for category in CategoryEnum)
    assert request["temperature"] == 0
    output_schema = request["response_format"]["json_schema"]
    assert output_schema["strict"] is True
    schema = output_schema["schema"]
    assert set(schema["$defs"]["CategoryEnum"]["enum"]) == {c.value for c in CategoryEnum}
    assert "category" in schema["required"]
    assert schema["additionalProperties"] is False


def test_multilingual_guidance_and_spelling_variants(service):
    requests = provider(service, [extraction("SEWERAGE_DRAINAGE")])
    service.call_structured("nali band hai", IntakeExtraction)
    guidance = requests[0]["messages"][0]["content"]
    for spelling in ("gutter", "gatar", "sewerage", "sewarage", "nali", "naali"):
        assert spelling in guidance
    assert "The sewer is overflowing outside the school => SEWERAGE_DRAINAGE" in guidance
    assert "اسکول کے سامنے گٹر ابل رہا ہے => SEWERAGE_DRAINAGE" in guidance
    assert "گلی میں تین دن سے کچرا نہیں اٹھایا => WASTE_SANITATION" in guidance
    assert "مرکزی سڑک کی اسٹریٹ لائٹس بند ہیں => STREET_LIGHTING" in guidance


@pytest.mark.parametrize("category", list(CategoryEnum))
def test_all_allowed_categories_validate(category):
    assert IntakeExtraction.model_validate_json(extraction(category)).category is category


@pytest.mark.parametrize("value", ["Sewerage", "DRAINAGE", "sewerage_drainage", "", None])
def test_free_form_categories_rejected(value):
    with pytest.raises(ValidationError):
        IntakeExtraction.model_validate_json(extraction(value))


def test_missing_category_rejected():
    with pytest.raises(ValidationError):
        IntakeExtraction.model_validate_json('{"summary":"Missing classification"}')


@pytest.mark.parametrize("content", [extraction("gutter"), '{"summary":"No category"}', 'not JSON'])
def test_invalid_ai_output_stays_pending(service, content):
    requests = provider(service, [content, content])
    assert service.call_structured("school k samny gutter overflow ho raha hy", IntakeExtraction) == {
        "status": "pending_fallback", "ai_status": "PENDING"}
    assert len(requests) == 2


def test_valid_retry_after_invalid_category(service):
    requests = provider(service, [extraction("gutter"), extraction("SEWERAGE_DRAINAGE")])
    result = service.call_structured(CLASSIFICATION_CASES[0][0], IntakeExtraction)
    assert result["ai_status"] == "PROCESSED"
    assert result["data"].category is CategoryEnum.SEWERAGE_DRAINAGE
    assert len(requests) == 2


def test_other_configured_models_still_validate_enum(service):
    service.model = "test-json-model"
    requests = provider(service, [extraction("unknown"), extraction("unknown")])
    result = service.call_structured("a report", IntakeExtraction)
    assert requests[0]["response_format"] == {"type": "json_object"}
    assert result["ai_status"] == "PENDING"


def failing_provider(service, error):
    def create(**kwargs):
        raise error
    service.client = SimpleNamespace(chat=SimpleNamespace(
        completions=SimpleNamespace(create=create)))


@pytest.mark.parametrize("model,path", [("openai/gpt-oss-120b", "json_schema"),
                                       ("test-json-model", "json_object")])
def test_safe_api_diagnostics_preserve_pending(service, caplog, model, path):
    service.model = model
    request = httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions",
                            headers={"Authorization": "Bearer private-header-value"})
    body = {"error": {"message": "Schema validation failed: unsupported schema property",
                      "failed_generation": "private-model-output"},
            "headers": {"Authorization": "private-body-header"}}
    error = APIStatusError("do not log exception string", response=httpx.Response(
        400, request=request, json=body), body=body)
    failing_provider(service, error)
    with caplog.at_level(logging.WARNING, logger="civicops.ai"):
        result = service.call_structured("private-report-text", IntakeExtraction, max_retries=1)
    assert result == {"status": "pending_fallback", "ai_status": "PENDING"}
    assert "APIStatusError" in caplog.text
    assert '"http_status": 400' in caplog.text
    assert f'"response_format": "{path}"' in caplog.text
    assert "unsupported schema property" in caplog.text
    for forbidden in ("private-header-value", "private-model-output", "private-body-header",
                      "private-report-text", "do not log exception string", "Traceback"):
        assert forbidden not in caplog.text


@pytest.mark.parametrize("message", ["test-groq-value", "test-supabase-value",
    "Authorization: Bearer token", "GROQ_API_KEY=hidden", "SUPABASE_SECRET_KEY=hidden",
    "gsk_unknownToken123", "sk-unknownToken123", "sb_secret_unknownToken123",
    "eyJunknownToken123", "prompt: private report", "headers: confidential",
    "private-report-text", "API key is invalid"])
def test_sensitive_provider_messages_omitted(service, monkeypatch, caplog, message):
    service.api_key = "test-groq-value"
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "test-supabase-value")
    body = {"error": {"message": message}}
    error = APIStatusError("unsafe raw exception", response=httpx.Response(
        503, request=httpx.Request("POST", "https://test.invalid")), body=body)
    failing_provider(service, error)
    with caplog.at_level(logging.WARNING, logger="civicops.ai"):
        result = service.call_structured("private-report-text", IntakeExtraction, max_retries=1)
    assert result["ai_status"] == "PENDING"
    assert message not in caplog.text
    assert '"http_status": 503' in caplog.text
    assert "omitted potentially sensitive" in caplog.text


def test_non_api_error_does_not_log_exception_message(service, caplog):
    failing_provider(service, RuntimeError("confidential provider information"))
    with caplog.at_level(logging.WARNING, logger="civicops.ai"):
        service.call_structured("report", IntakeExtraction, max_retries=1)
    assert "RuntimeError" in caplog.text
    assert "confidential" not in caplog.text
    assert "http_status" not in caplog.text


def test_validation_error_does_not_log_model_output(service, caplog):
    provider(service, ['{"category":"private-model-output"}'])
    with caplog.at_level(logging.WARNING, logger="civicops.ai"):
        result = service.call_structured("report", IntakeExtraction, max_retries=1)
    assert result["ai_status"] == "PENDING"
    assert "ValidationError" in caplog.text
    assert "private-model-output" not in caplog.text


@pytest.mark.skipif(os.environ.get("CIVICOPS_RUN_LIVE_AI_TESTS") != "1"
                    or not os.environ.get("GROQ_API_KEY"),
                    reason="Live Groq classification requires explicit opt-in and server credentials")
@pytest.mark.parametrize("report,expected", CLASSIFICATION_CASES)
def test_live_roman_urdu_classification(report, expected):
    # Never include provider exceptions, credentials, or environment values in output.
    result = AIIntakeService().call_structured(report, IntakeExtraction)
    assert result["status"] == "success", "Live AI intake remained pending"
    assert result["data"].category.value == expected
