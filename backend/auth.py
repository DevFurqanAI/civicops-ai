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
    role: Literal["CITIZEN", "OPERATOR", "ADMIN", "DEPARTMENT"]
    department_id: str | None = None

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
    if not profile or profile.get("role") not in {"CITIZEN", "OPERATOR", "ADMIN", "DEPARTMENT"}:
        raise HTTPException(403, "An authorized profile is required")
    department_id = profile.get("department_id") if profile["role"] == "DEPARTMENT" else None
    if profile["role"] == "DEPARTMENT":
        department = repository.find("departments", "id", department_id) if department_id else None
        if not department or not department.get("is_active"):
            raise HTTPException(403, "Active department membership required")
    return CurrentUser(user_id, profile["role"], department_id)

def current_user(user=Depends(optional_user)):
    if user is None:
        raise HTTPException(401, "Authentication required", headers={"WWW-Authenticate": "Bearer"})
    return user

def operator_user(user=Depends(current_user)):
    if user.role not in {"OPERATOR", "ADMIN"}:
        raise HTTPException(403, "Operator access required")
    return user

def department_user(user=Depends(current_user)):
    if user.role != "DEPARTMENT" or not user.department_id:
        raise HTTPException(403, "Department access required")
    return user

def require_department_incident(repository, identity, user):
    incident = repository.resolve(identity)
    if (not incident or incident.get("archived_at") or user.role != "DEPARTMENT"
            or incident.get("current_department_id") != user.department_id):
        raise HTTPException(404, "Incident not found")
    assignments = repository.rows("incident_assignments", (("eq", "incident_id", incident["id"]),
        ("eq", "department_id", user.department_id), ("is_", "completed_at", "null")))
    if not assignments or incident["status"] not in {
            "ASSIGNED", "ACCEPTED", "IN_PROGRESS", "RESOLVED_PENDING_VERIFICATION"}:
        raise HTTPException(404, "Incident not found")
    return incident

def require_report_access(row, user):
    owner = row.get("reporter_id")
    if owner and (user is None or (user.user_id != owner and user.role not in {"OPERATOR", "ADMIN"})):
        raise HTTPException(404, "Report not found")
