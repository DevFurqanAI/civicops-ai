"""Central transition policy and atomic operational RPC dispatch."""
from fastapi import HTTPException

STATUS_TRANSITIONS = {
    "RECEIVED": ("VERIFIED", "NEEDS_REVIEW"),
    "NEEDS_REVIEW": ("VERIFIED", "REJECTED"),
    "VERIFIED": ("ASSIGNED", "NEEDS_REVIEW"),
    "ASSIGNED": ("ACCEPTED", "NEEDS_REVIEW"),
    "ACCEPTED": ("IN_PROGRESS", "NEEDS_REVIEW"),
    "IN_PROGRESS": ("RESOLVED_PENDING_VERIFICATION", "NEEDS_REVIEW"),
    "RESOLVED_PENDING_VERIFICATION": ("RESOLVED", "REOPENED"),
    "RESOLVED": ("REOPENED",),
    "REOPENED": ("ASSIGNED", "NEEDS_REVIEW"),
    "REJECTED": (),
}

DEPARTMENT_TRANSITIONS = {"ASSIGNED": "ACCEPTED", "ACCEPTED": "IN_PROGRESS",
                          "IN_PROGRESS": "RESOLVED_PENDING_VERIFICATION"}

def allowed_statuses(incident, role):
    targets = STATUS_TRANSITIONS.get(incident["status"], ())
    if role == "DEPARTMENT":
        targets = tuple(s for s in targets if s == DEPARTMENT_TRANSITIONS.get(incident["status"]))
    elif role in {"OPERATOR", "ADMIN"}:
        targets = tuple(s for s in targets if s != DEPARTMENT_TRANSITIONS.get(incident["status"]))
    else:
        return ()
    return tuple(s for s in targets
                 if not (s == "IN_PROGRESS" and incident["response_plan_status"] != "APPROVED")
                 and not (s == "ASSIGNED" and not incident.get("current_department_id")))

def perform(repository, incident, user, action, values):
    allowed = allowed_statuses(incident, user.role)
    if action == "STATUS" and values["status"] not in allowed:
        raise HTTPException(409, "Invalid status transition")
    if action == "STATUS" and values["status"] == "REJECTED" and not (values.get("notes") or "").strip():
        raise HTTPException(422, "Rejection requires a reason")
    if action == "STATUS" and (values["status"] == "RESOLVED_PENDING_VERIFICATION" or
            (incident["status"] == "RESOLVED_PENDING_VERIFICATION" and values["status"] == "REOPENED")):
        if not (values.get("notes") or "").strip():
            raise HTTPException(422, "Completion or rejection requires a note")
    parameters = {"p_incident_id": incident["id"], "p_actor_id": user.user_id,
                  "p_expected_updated_at": values.get("expected_updated_at") or incident["updated_at"],
                  "p_notes": values.get("notes")}
    if action == "STATUS":
        name = "civicops_change_incident_status"
        parameters["p_new_status"] = values["status"]
    elif action == "ASSIGN":
        name = "civicops_assign_incident_department"
        parameters["p_department_id"] = values["department_id"]
    elif action.startswith("PLAN_"):
        name = "civicops_review_incident_response_plan"
        parameters.update(p_action=values["action"], p_response_plan=values.get("response_plan"))
    else:
        raise HTTPException(422, "Unsupported operational action")
    return repository.rpc(name, parameters)
