from fastapi import APIRouter
from backend.models.common import PriorityEnum, IncidentStatusEnum
from backend.utils.helpers import INCIDENTS_DB

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])

@router.get("/summary")
def get_dashboard_summary():
    incidents = list(INCIDENTS_DB.values())
    return {
        "total_active": len(incidents),
        "critical": sum(1 for i in incidents if i["priority"] == PriorityEnum.CRITICAL),
        "awaiting_verification": sum(1 for i in incidents if i["status"] == IncidentStatusEnum.RECEIVED),
        "resolved": sum(1 for i in incidents if i["status"] == IncidentStatusEnum.RESOLVED)
    }
