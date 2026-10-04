from datetime import datetime
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field
from backend.models.common import CategoryEnum, PriorityEnum, IncidentStatusEnum, DepartmentEnum

class VersionedOperation(BaseModel):
    expected_updated_at: Optional[datetime] = None

class StatusUpdateRequest(VersionedOperation):
    status: IncidentStatusEnum
    notes: Optional[str] = Field(None, max_length=2000)

class AssignDepartmentRequest(VersionedOperation):
    department: DepartmentEnum
    notes: Optional[str] = Field(None, max_length=2000)

class ResponsePlanRequest(VersionedOperation):
    action: Literal["APPROVE", "MODIFY", "REJECT"]
    response_plan: Optional[List[str]] = Field(None, max_length=30)
    notes: Optional[str] = Field(None, max_length=2000)

class OperationalNoteRequest(BaseModel):
    notes: str = Field(..., min_length=1, max_length=2000)

class DepartmentNoteRequest(VersionedOperation):
    notes: str = Field(..., min_length=1, max_length=2000)

class IncidentResponse(BaseModel):
    incident_id: str
    updated_at: str
    incident_code: str
    category: CategoryEnum
    title: str
    summary: str
    location: Dict[str, Any]
    priority: PriorityEnum
    evidence_confidence: float
    supporting_signals: List[Dict[str, Any]] = []
    spam_risk: float
    report_count: int
    department: DepartmentEnum
    status: IncidentStatusEnum
    response_plan: List[str]
    response_plan_status: str
    reported_urgency: str
