from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from backend.models.common import CategoryEnum, PriorityEnum, IncidentStatusEnum, DepartmentEnum

class StatusUpdateRequest(BaseModel):
    status: IncidentStatusEnum
    notes: Optional[str] = None

class AssignDepartmentRequest(BaseModel):
    department: DepartmentEnum

class IncidentResponse(BaseModel):
    incident_id: str
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
    reported_urgency: str
