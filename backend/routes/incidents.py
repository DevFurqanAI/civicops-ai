from fastapi import APIRouter, HTTPException
from backend.models.incident import StatusUpdateRequest, AssignDepartmentRequest
from backend.models.common import IncidentStatusEnum
from backend.utils.helpers import INCIDENTS_DB

router = APIRouter(prefix="/api/incidents", tags=["Incidents"])

@router.get("")
def get_incidents():
    return list(INCIDENTS_DB.values())

@router.get("/{incident_id}")
def get_incident(incident_id: str):
    if incident_id not in INCIDENTS_DB:
        raise HTTPException(status_code=404, detail="Incident not found")
    return INCIDENTS_DB[incident_id]

@router.post("/{incident_id}/status")
def update_incident_status(incident_id: str, payload: StatusUpdateRequest):
    if incident_id not in INCIDENTS_DB:
        raise HTTPException(status_code=404, detail="Incident not found")
    INCIDENTS_DB[incident_id]["status"] = payload.status
    return {"status": "success", "incident_id": incident_id, "new_status": payload.status}

@router.post("/{incident_id}/assign")
def assign_department(incident_id: str, payload: AssignDepartmentRequest):
    if incident_id not in INCIDENTS_DB:
        raise HTTPException(status_code=404, detail="Incident not found")
    INCIDENTS_DB[incident_id]["department"] = payload.department
    INCIDENTS_DB[incident_id]["status"] = IncidentStatusEnum.ASSIGNED
    return {"status": "success", "incident_id": incident_id, "department": payload.department}
