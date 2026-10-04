"""Central transition policy and atomic operational RPC dispatch."""
from fastapi import HTTPException

STATUS_TRANSITIONS = {
    "RECEIVED": ("VERIFIED", "NEEDS_REVIEW"),
    "NEEDS_REVIEW": ("VERIFIED", "REJECTED"),
    "VERIFIED": ("ASSIGNED", "NEEDS_REVIEW"),
    "ASSIGNED": ("IN_PROGRESS", "NEEDS_REVIEW"),
    "IN_PROGRESS": ("RESOLVED", "NEEDS_REVIEW"),
    "RESOLVED": ("REOPENED",),
    "REOPENED": ("ASSIGNED", "IN_PROGRESS", "NEEDS_REVIEW"),
    "REJECTED": (),
}

def perform(repository, incident, user, action, values):
    allowed = STATUS_TRANSITIONS.get(incident["status"], ())
    if action == "STATUS" and values["status"] not in allowed:
        raise HTTPException(409, "Invalid status transition")
    if action == "STATUS" and values["status"] == "REJECTED" and not (values.get("notes") or "").strip():
        raise HTTPException(422, "Rejection requires a reason")
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
