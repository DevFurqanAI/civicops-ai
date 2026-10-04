from fastapi import APIRouter, Depends
from backend.database import get_incidents_repository
from backend.auth import operator_user

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("/summary")
def get_dashboard_summary(repository=Depends(get_incidents_repository), user=Depends(operator_user)):
    incidents = repository.rows("incidents", (("is_", "archived_at", "null"),))
    active = [i for i in incidents if i["status"] not in {"RESOLVED", "REJECTED"}]
    return {"total_active": len(active),
        "critical": sum(i["priority"] == "CRITICAL" for i in active),
        "awaiting_verification": sum(i["status"] in {"RECEIVED", "NEEDS_REVIEW"} for i in active),
        "resolved": sum(i["status"] == "RESOLVED" for i in incidents)}
