"""Compatibility export for the centralized server-only Supabase client factory.

Routes use backend.database repository dependencies backed by app.state.supabase.
Do not create a second client at import time or silently disable persistence.
"""

from backend.database import create_backend_client

__all__ = ["create_backend_client"]
