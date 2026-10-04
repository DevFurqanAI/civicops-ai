from typing import Optional, List
from pydantic import BaseModel, Field
from backend.models.common import CategoryEnum, PriorityEnum, IncidentStatusEnum

class ReportCreate(BaseModel):
    submission_id: str = Field(..., description="Client-generated unique idempotency UUID")
    text: str = Field(..., min_length=3, description="Raw citizen report text")
    language: str = Field("en", description="Language: en, ur, or roman_urdu")
    latitude: Optional[float] = Field(None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(None, ge=-180.0, le=180.0)
    landmark_text: Optional[str] = None
    image_url: Optional[str] = None

class SupportingSignal(BaseModel):
    signal: str
    detail: str
    impact: str

class ReportResponse(BaseModel):
    public_id: str = Field(..., description="Human-readable ID like CV-1042")
    internal_id: str
    submission_id: str
    status: IncidentStatusEnum
    ai_status: str
    category: CategoryEnum
    reported_urgency: str = Field(..., description="Citizen claimed urgency extracted by AI")
    priority: PriorityEnum = Field(..., description="Final rules-engine determined priority")
    evidence_confidence: float = Field(..., ge=0.0, le=1.0)
    supporting_signals: List[SupportingSignal]
    spam_risk: float = Field(..., ge=0.0, le=1.0)
    idempotent_replay: bool = False
