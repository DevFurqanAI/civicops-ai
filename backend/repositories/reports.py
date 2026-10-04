"""Durable reports, with database uniqueness arbitrating concurrent submissions."""
from uuid import uuid4
import json
import logging
import os
import re

from fastapi import HTTPException
from postgrest.exceptions import APIError

logger = logging.getLogger("civicops.database")


def log_insert_failure(error):
    code = error.code if isinstance(error, APIError) else None
    code = code if isinstance(code, str) and re.fullmatch(r"(?:[A-Z0-9]{5}|PGRST\d+)", code) else None
    message = "Database error message omitted; inspect error code"
    if isinstance(error, APIError) and isinstance(error.message, str):
        # Postgres details often contain the entire failing citizen row. Never
        # log details, hints, exception reprs, requests, or arbitrary message text.
        # Only these full, fixed diagnostic templates are eligible.
        patterns = (
            r'new row for relation "[a-zA-Z0-9_]+" violates check constraint "[a-zA-Z0-9_]+"',
            r'null value in column "[a-zA-Z0-9_]+" of relation "[a-zA-Z0-9_]+" violates not-null constraint',
            r'duplicate key value violates unique constraint "[a-zA-Z0-9_]+"',
            r'permission denied for (?:table|schema) [a-zA-Z0-9_]+',
            r'new row violates row-level security policy for table "[a-zA-Z0-9_]+"',
            r'Could not find the \'[a-zA-Z0-9_]+\' column of \'reports\' in the schema cache',
            r'column "[a-zA-Z0-9_]+" of relation "reports" does not exist',
        )
        candidate = error.message
        secrets = (os.environ.get("SUPABASE_SECRET_KEY"), os.environ.get("GROQ_API_KEY"))
        if (not any(secret and secret in candidate for secret in secrets)
                and any(re.fullmatch(pattern, candidate) for pattern in patterns)):
            message = candidate
    elif isinstance(error, (ValueError, TypeError)):
        message = "Report INSERT payload could not be converted to plain JSON"
    elif isinstance(error, HTTPException):
        message = "Report INSERT returned no row representation"
    logger.warning("Supabase repository failure: %s", json.dumps({
        "operation": "reports.insert", "exception_class": type(error).__name__,
        "error_code": code, "safe_error_message": message,
    }))


class ReportsRepository:
    def __init__(self, client):
        self.client = client

    def _find(self, **filters):
        try:
            query = self.client.table("reports").select("*")
            for field, value in filters.items():
                query = query.eq(field, value)
            rows = query.limit(1).execute().data
            return rows[0] if rows else None
        except Exception:
            raise HTTPException(503, "Report storage unavailable") from None

    def by_submission(self, scope, submission_id):
        return self._find(idempotency_scope=scope, submission_id=submission_id)

    def by_public_id(self, public_id):
        return self._find(public_id=public_id)

    def insert(self, row):
        for _ in range(5):
            try:
                candidate = {**row, "id": str(uuid4()), "public_id": "CV-" + uuid4().hex.upper()}
                rows = self.client.table("reports").insert(candidate).execute().data
                if not rows:
                    raise HTTPException(503, "Report storage unavailable")
                return rows[0], False
            except APIError as error:
                log_insert_failure(error)
                if error.code != "23505":
                    raise HTTPException(503, "Report storage unavailable") from None
                # Another request may have won the submission race. Never overwrite it.
                existing = self.by_submission(row["idempotency_scope"], row["submission_id"])
                if existing:
                    return existing, True
                # Retry an ID/public-ID collision with fresh identifiers.
            except HTTPException as error:
                log_insert_failure(error)
                raise
            except Exception as error:
                log_insert_failure(error)
                raise HTTPException(503, "Report storage unavailable") from None
        raise HTTPException(503, "Could not allocate a unique report identifier")
