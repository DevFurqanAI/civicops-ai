import json
import logging
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from postgrest.exceptions import APIError

from backend.repositories.reports import ReportsRepository


def repository_with_error(error):
    def execute():
        raise error
    return ReportsRepository(SimpleNamespace(table=lambda _: SimpleNamespace(
        insert=lambda _: SimpleNamespace(execute=execute))))


def failure(repository, caplog):
    with caplog.at_level(logging.WARNING, logger="civicops.database"):
        with pytest.raises(HTTPException) as caught:
            repository.insert({"text": "private citizen report", "tracking_token_hash": "private-token"})
    assert caught.value.status_code == 503
    assert caught.value.detail == "Report storage unavailable"
    return json.loads(caplog.records[-1].getMessage().split(": ", 1)[1])


def test_insert_constraint_diagnostic_is_safe(caplog):
    error = APIError({"code": "23514", "message":
        'new row for relation "reports" violates check constraint "reports_reported_urgency_check"',
        "details": "Failing row contains private citizen report and private-token",
        "hint": "Authorization: private-header"})
    diagnostic = failure(repository_with_error(error), caplog)
    assert diagnostic == {
        "operation": "reports.insert", "exception_class": "APIError", "error_code": "23514",
        "safe_error_message": error.message,
    }
    for forbidden in ("private citizen report", "private-token", "private-header", "Authorization"):
        assert forbidden not in caplog.text


@pytest.mark.parametrize("message", ["private citizen report", "Authorization: private-header",
                                     "tracking_token=private-token", "test-only-supabase-key"])
def test_untrusted_api_messages_not_logged(caplog, monkeypatch, message):
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "test-only-supabase-key")
    diagnostic = failure(repository_with_error(APIError({"code": "42501", "message": message})), caplog)
    assert diagnostic["error_code"] == "42501"
    assert message not in caplog.text


def test_non_api_exception_logs_class_only(caplog):
    diagnostic = failure(repository_with_error(TypeError("private citizen report")), caplog)
    assert diagnostic["exception_class"] == "TypeError"
    assert diagnostic["error_code"] is None
    assert "private citizen report" not in caplog.text
