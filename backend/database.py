"""Server-only database configuration. Never include client errors or keys in logs."""

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Request
from supabase import Client, ClientOptions, create_client


# Always load backend/.env regardless of current working directory
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


def create_backend_client() -> Client:
    names = ("SUPABASE_URL", "SUPABASE_SECRET_KEY")

    missing = [
        name
        for name in names
        if not os.environ.get(name, "").strip()
    ]

    if missing:
        raise RuntimeError(
            "Missing required backend environment variables: "
            + ", ".join(missing)
        )

    try:
        return create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_SECRET_KEY"],
            options=ClientOptions(
                auto_refresh_token=False,
                persist_session=False,
                postgrest_client_timeout=15,
            ),
        )

    except Exception:
        raise RuntimeError(
            "Unable to initialize backend Supabase client; check server configuration"
        ) from None


def get_reports_repository(request: Request):
    from backend.repositories.reports import ReportsRepository

    return ReportsRepository(request.app.state.supabase)


def get_incidents_repository(request: Request):
    from backend.repositories.incidents import IncidentsRepository
    return IncidentsRepository(request.app.state.supabase)
