from fastapi import APIRouter
from backend.models.common import PriorityEnum, IncidentStatusEnum
from backend.services.supabase_client import supabase

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])

@router.get("/summary")
def get_dashboard_summary():
    incidents = []
    if supabase:
        res = supabase.table("incidents").select("*").execute()
        incidents = res.data or []
        
    return {
        "total_active": len(incidents),
        "critical": sum(1 for i in incidents if i.get("priority") == PriorityEnum.CRITICAL),
        "awaiting_verification": sum(1 for i in incidents if i.get("status") == IncidentStatusEnum.RECEIVED),
        "resolved": sum(1 for i in incidents if i.get("status") == IncidentStatusEnum.RESOLVED)
    }
