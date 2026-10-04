import pytest
from backend.config import validate_production


def test_production_configuration_fails_with_names_not_values(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "private-test-value")
    monkeypatch.delenv("FRONTEND_ORIGINS", raising=False)
    with pytest.raises(RuntimeError) as error:
        validate_production()
    assert "FRONTEND_ORIGINS" in str(error.value) and "private-test-value" not in str(error.value)


@pytest.mark.parametrize("origin", ["*", "http://frontend.example", "https://frontend.example/path", "https://user:password@frontend.example"])
def test_invalid_production_cors_rejected(monkeypatch, origin):
    for name,value in {"APP_ENV":"production","SUPABASE_URL":"https://project.example", "SUPABASE_SECRET_KEY":"test",
        "GROQ_API_KEY":"test","LLM_MODEL":"test-model","FRONTEND_ORIGINS":origin}.items(): monkeypatch.setenv(name,value)
    with pytest.raises(RuntimeError): validate_production()


def test_valid_production_configuration(monkeypatch):
    for name,value in {"APP_ENV":"production","SUPABASE_URL":"https://project.example", "SUPABASE_SECRET_KEY":"test",
        "GROQ_API_KEY":"test","LLM_MODEL":"test-model","FRONTEND_ORIGINS":"https://frontend.example,https://preview.example"}.items(): monkeypatch.setenv(name,value)
    validate_production()
