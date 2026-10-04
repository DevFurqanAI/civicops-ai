from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException
from backend.database import get_incidents_repository
from backend.models.incident import IncidentResponse, StatusUpdateRequest, AssignDepartmentRequest, ResponsePlanRequest, OperationalNoteRequest
from backend.auth import operator_user
from backend.services.operations import perform, allowed_statuses
from backend.services.incident_adapter import incident_response

router = APIRouter(prefix="/api/incidents", tags=["Incidents"])


@router.get("", response_model=list[IncidentResponse])
def get_incidents(repository=Depends(get_incidents_repository), user=Depends(operator_user)):
    return [incident_response(repository, row) for row in repository.rows(
        "incidents", (("is_", "archived_at", "null"),))]


@router.get("/{incident_id}", response_model=IncidentResponse)
def get_incident(incident_id: str, repository=Depends(get_incidents_repository), user=Depends(operator_user)):
    incident = repository.resolve(incident_id)
    if not incident:
        raise HTTPException(404, "Incident not found")
    return incident_response(repository, incident)



def require_incident(repository, identity):
    incident = repository.resolve(identity)
    if not incident or incident.get("archived_at"):
        raise HTTPException(404, "Incident not found")
    return incident

@router.get("/{incident_id}/actions")
def available_actions(incident_id: str, repository=Depends(get_incidents_repository), user=Depends(operator_user)):
    incident = require_incident(repository, incident_id)
    return {"allowed_statuses": allowed_statuses(incident, user.role)}

@router.get("/{incident_id}/work-history")
def work_history(incident_id: str, repository=Depends(get_incidents_repository), user=Depends(operator_user)):
    incident = require_incident(repository, incident_id)
    rows = repository.rows("audit_logs", (("eq", "incident_id", incident["id"]),))
    return [{"notes": r["details"]["notes"], "created_at": r["created_at"], "action": r["action"]}
            for r in sorted(rows, key=lambda r: (r["created_at"], r["id"]))
            if (r.get("details") or {}).get("role") == "DEPARTMENT" and (r.get("details") or {}).get("notes")]

@router.post("/{incident_id}/status")
def update_incident_status(incident_id: str, payload: StatusUpdateRequest,
                           repository=Depends(get_incidents_repository), user=Depends(operator_user)):
    return perform(repository, require_incident(repository, incident_id), user, "STATUS", payload.model_dump(mode="json"))

@router.post("/{incident_id}/assign")
def assign_department(incident_id: str, payload: AssignDepartmentRequest,
                      repository=Depends(get_incidents_repository), user=Depends(operator_user)):
    department = repository.department(payload.department.value)
    return perform(repository, require_incident(repository, incident_id), user, "ASSIGN",
                   {"department_id": department["id"], "notes": payload.notes,
                    "expected_updated_at": payload.expected_updated_at})

@router.post("/{incident_id}/response-plan")
def response_plan(incident_id: str, payload: ResponsePlanRequest,
                  repository=Depends(get_incidents_repository), user=Depends(operator_user)):
    incident = require_incident(repository, incident_id)
    if payload.action == "MODIFY" and (not payload.response_plan or any(not step.strip() or len(step) > 1000 for step in payload.response_plan)):
        raise HTTPException(422, "A nonempty response plan is required")
    if payload.action != "MODIFY" and payload.response_plan is not None:
        raise HTTPException(422, "Only modify accepts a replacement plan")
    if payload.action == "APPROVE" and not incident["response_plan"]:
        raise HTTPException(422, "An empty plan cannot be approved")
    return perform(repository, incident, user, "PLAN_" + payload.action, payload.model_dump(mode="json"))

@router.post("/{incident_id}/notes")
def add_note(incident_id: str, payload: OperationalNoteRequest,
             repository=Depends(get_incidents_repository), user=Depends(operator_user)):
    if not payload.notes.strip():
        raise HTTPException(422, "A note is required")
    incident = require_incident(repository, incident_id)
    event = repository.insert_once("audit_logs", {"id": str(uuid4()), "actor_type": user.role,
        "actor_id": user.user_id, "incident_id": incident["id"], "action": "OPERATIONAL_NOTE_ADDED",
        "details": {"notes": payload.notes.strip()}})
    return {"status": "recorded", "created_at": event["created_at"]}
