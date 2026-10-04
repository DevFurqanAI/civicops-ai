from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from uuid import UUID
from backend.auth import current_user
from backend.database import get_reports_repository, get_incidents_repository

router = APIRouter(prefix="/api/feedback", tags=["Feedback"])

class FeedbackCreate(BaseModel):
    public_id: str = Field(..., min_length=1, max_length=80)
    incident_id: UUID
    response: Literal["YES", "PARTIALLY", "NO"]
    comment: str | None = Field(None, max_length=2000)

@router.post("", status_code=201)
def submit_feedback(payload: FeedbackCreate, user=Depends(current_user),
                    reports=Depends(get_reports_repository), incidents=Depends(get_incidents_repository)):
    row = reports.by_public_id(payload.public_id)
    if user.role != "CITIZEN" or not row or row.get("reporter_id") != user.user_id:
        raise HTTPException(403, "Feedback requires your own citizen report")
    link = incidents.link_for_report(row["id"])
    if not link or link["incident_id"] != str(payload.incident_id):
        raise HTTPException(403, "Report is not linked to this incident")
    incident = incidents.find("incidents", "id", link["incident_id"])
    if not incident or incident["status"] != "RESOLVED":
        raise HTTPException(409, "Feedback requires a resolved incident")
    if incidents.rows("resolution_feedback", (("eq", "report_id", row["id"]), ("eq", "incident_id", incident["id"]))):
        raise HTTPException(409, "Feedback already submitted")
    return incidents.rpc("civicops_submit_resolution_feedback", {"p_report_id": row["id"],
        "p_incident_id": incident["id"], "p_actor_id": user.user_id,
        "p_response": payload.response, "p_comment": payload.comment})
