from fastapi import APIRouter, HTTPException
from backend.models.incident import StatusUpdateRequest, AssignDepartmentRequest
from backend.models.common import IncidentStatusEnum
from backend.services.supabase_client import supabase

router = APIRouter(prefix="/api/incidents", tags=["Incidents"])

@router.get("")
def get_incidents():
    if supabase:
        res = supabase.table("incidents").select("*").execute()
        return res.data or []
    return []

@router.get("/{incident_id}")
def get_incident(incident_id: str):
    if supabase:
        res = supabase.table("incidents").select("*").eq("incident_id", incident_id).execute()
        if res.data and len(res.data) > 0:
            return res.data[0]
    raise HTTPException(status_code=404, detail="Incident not found")

@router.post("/{incident_id}/status")
def update_incident_status(incident_id: str, payload: StatusUpdateRequest):
    if supabase:
        res = supabase.table("incidents").select("*").eq("incident_id", incident_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Incident not found")
        
        supabase.table("incidents").update({"status": payload.status}).eq("incident_id", incident_id).execute()
        return {"status": "success", "incident_id": incident_id, "new_status": payload.status}
    raise HTTPException(status_code=404, detail="Incident not found")

@router.post("/{incident_id}/assign")
def assign_department(incident_id: str, payload: AssignDepartmentRequest):
    if supabase:
        res = supabase.table("incidents").select("*").eq("incident_id", incident_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Incident not found")
        
        supabase.table("incidents").update({
            "department": payload.department,
            "status": IncidentStatusEnum.ASSIGNED
        }).eq("incident_id", incident_id).execute()
        return {"status": "success", "incident_id": incident_id, "department": payload.department}
    raise HTTPException(status_code=404, detail="Incident not found")
