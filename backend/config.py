"""Production validation reports variable names only, never their values."""
import os
from urllib.parse import urlsplit


def validate_production():
    if os.environ.get("APP_ENV", "development") != "production":
        return
    required = ("SUPABASE_URL", "SUPABASE_SECRET_KEY", "GROQ_API_KEY", "LLM_MODEL", "FRONTEND_ORIGINS")
    missing = [name for name in required if not os.environ.get(name, "").strip()]
    if missing:
        raise RuntimeError("Missing production configuration: " + ", ".join(missing))
    if urlsplit(os.environ["SUPABASE_URL"]).scheme != "https":
        raise RuntimeError("Production SUPABASE_URL must use HTTPS")
    for origin in os.environ["FRONTEND_ORIGINS"].split(","):
        parsed = urlsplit(origin.strip())
        if (parsed.scheme != "https" or not parsed.netloc or parsed.path or parsed.query
                or parsed.fragment or parsed.username or parsed.password):
            raise RuntimeError("Production FRONTEND_ORIGINS must contain exact HTTPS origins without paths")
