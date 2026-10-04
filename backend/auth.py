"""JWT verification is delegated to Supabase Auth; roles are fresh database values."""
from dataclasses import dataclass
from typing import Literal
from uuid import UUID
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase_auth.errors import AuthApiError
from backend.database import get_incidents_repository

bearer = HTTPBearer(auto_error=False)

@dataclass(frozen=True)
class CurrentUser:
    user_id: str
    role: Literal["CITIZEN", "OPERATOR", "ADMIN"]

def optional_user(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
                  repository=Depends(get_incidents_repository)):
    if credentials is None:
        # Malformed authorization must not downgrade to an anonymous submission.
        if request.headers.get("Authorization"):
            raise HTTPException(401, "Invalid or expired access token", headers={"WWW-Authenticate": "Bearer"})
        return None
    try:
        response = request.app.state.supabase.auth.get_user(credentials.credentials)
        user = response.user
        user_id = str(UUID(user.id)) if user else None
        if not user_id or getattr(user, "is_anonymous", False):
            raise ValueError("No authenticated user")
    except AuthApiError as error:
        if isinstance(getattr(error, "status", None), int) and error.status >= 500:
            raise HTTPException(503, "Authentication temporarily unavailable") from None
        raise HTTPException(401, "Invalid or expired access token", headers={"WWW-Authenticate": "Bearer"}) from None
    except (ValueError, AttributeError):
        raise HTTPException(401, "Invalid or expired access token", headers={"WWW-Authenticate": "Bearer"}) from None
    except Exception:
        raise HTTPException(503, "Authentication temporarily unavailable") from None
    profile = repository.find("profiles", "id", user_id)
    if not profile or profile.get("role") not in {"CITIZEN", "OPERATOR", "ADMIN"}:
        raise HTTPException(403, "An authorized profile is required")
    return CurrentUser(user_id, profile["role"])

def current_user(user=Depends(optional_user)):
    if user is None:
        raise HTTPException(401, "Authentication required", headers={"WWW-Authenticate": "Bearer"})
    return user

def operator_user(user=Depends(current_user)):
    if user.role not in {"OPERATOR", "ADMIN"}:
        raise HTTPException(403, "Operator access required")
    return user

def require_report_access(row, user):
    owner = row.get("reporter_id")
    if owner and (user is None or (user.user_id != owner and user.role not in {"OPERATOR", "ADMIN"})):
        raise HTTPException(404, "Report not found")
