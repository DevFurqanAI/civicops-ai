"""Department-scoped operational reads and transactional work updates."""
from fastapi import APIRouter, Depends, HTTPException
from backend.auth import department_user, require_department_incident
from backend.database import get_incidents_repository
from backend.models.incident import IncidentResponse, StatusUpdateRequest, DepartmentNoteRequest
from backend.services.incident_adapter import incident_response
from backend.services.operations import allowed_statuses, perform

router = APIRouter(prefix="/api/department/incidents", tags=["Department"])

@router.get("", response_model=list[IncidentResponse])
def queue(repository=Depends(get_incidents_repository), user=Depends(department_user)):
    rows = repository.rows("incidents", (("eq", "current_department_id", user.department_id),
        ("is_", "archived_at", "null"), ("in_", "status",
        ["ASSIGNED", "ACCEPTED", "IN_PROGRESS", "RESOLVED_PENDING_VERIFICATION"])))
    result = []
    for row in rows:
        try:
            require_department_incident(repository, row["id"], user)
        except HTTPException as error:
            if error.status_code != 404:
                raise
            continue
        result.append(incident_response(repository, row))
    return result

@router.get("/{incident_id}", response_model=IncidentResponse)
def detail(incident_id: str, repository=Depends(get_incidents_repository), user=Depends(department_user)):
    return incident_response(repository, require_department_incident(repository, incident_id, user))

@router.get("/{incident_id}/actions")
def actions(incident_id: str, repository=Depends(get_incidents_repository), user=Depends(department_user)):
    incident = require_department_incident(repository, incident_id, user)
    return {"allowed_statuses": allowed_statuses(incident, user.role)}

@router.get("/{incident_id}/history")
def history(incident_id: str, repository=Depends(get_incidents_repository), user=Depends(department_user)):
    incident = require_department_incident(repository, incident_id, user)
    rows = repository.rows("incident_status_history", (("eq", "incident_id", incident["id"]),))
    # Historical private operator notes are not disclosed to departments.
    return [{"old_status": r.get("old_status"), "new_status": r["new_status"], "created_at": r["created_at"]}
            for r in sorted(rows, key=lambda r: (r["created_at"], r["id"]))]

@router.get("/{incident_id}/updates")
def updates(incident_id: str, repository=Depends(get_incidents_repository), user=Depends(department_user)):
    incident = require_department_incident(repository, incident_id, user)
    rows = repository.rows("audit_logs", (("eq", "incident_id", incident["id"]),))
    return [{"notes": r["details"]["notes"], "created_at": r["created_at"], "action": r["action"]}
            for r in sorted(rows, key=lambda r: (r["created_at"], r["id"]))
            if (r.get("details") or {}).get("department_id") == user.department_id
            and (r.get("details") or {}).get("role") == "DEPARTMENT"
            and r["action"] in {"DEPARTMENT_WORK_UPDATE", "INCIDENT_STATUS_CHANGED"}
            and (r.get("details") or {}).get("notes")]

@router.post("/{incident_id}/status")
def change_status(incident_id: str, payload: StatusUpdateRequest,
                  repository=Depends(get_incidents_repository), user=Depends(department_user)):
    return perform(repository, require_department_incident(repository, incident_id, user),
                   user, "STATUS", payload.model_dump(mode="json"))

@router.post("/{incident_id}/updates")
def add_update(incident_id: str, payload: DepartmentNoteRequest,
               repository=Depends(get_incidents_repository), user=Depends(department_user)):
    incident = require_department_incident(repository, incident_id, user)
    if not payload.notes.strip():
        raise HTTPException(422, "A work update is required")
    return repository.rpc("civicops_add_department_work_update", {
        "p_incident_id": incident["id"], "p_actor_id": user.user_id,
        "p_expected_updated_at": payload.expected_updated_at or incident["updated_at"],
        "p_notes": payload.notes.strip()})
