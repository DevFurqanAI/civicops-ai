from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/feedback", tags=["Feedback"])

class FeedbackCreate(BaseModel):
    incident_id: str
    rating: int
    comments: str

@router.post("")
def submit_feedback(payload: FeedbackCreate):
    return {"status": "success", "message": "Feedback recorded successfully"}
