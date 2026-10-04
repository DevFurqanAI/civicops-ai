import random
from fastapi import APIRouter, Header, HTTPException, status
from backend.models.report import ReportCreate, ReportResponse
from backend.models.common import CategoryEnum, IncidentStatusEnum
from backend.services.ai_intake import ai_intake_service, IntakeExtraction
from backend.services.priority_engine import calculate_rules_priority
from backend.services.routing_engine import route_to_department
from backend.services.evidence_engine import calculate_evidence_confidence
from backend.services.spam_detection import evaluate_spam_risk
from backend.services.response_planner import generate_response_plan
from backend.services.supabase_client import supabase

router = APIRouter(prefix="/api/reports", tags=["Reports"])

@router.post("", response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
async def create_report(payload: ReportCreate, idempotency_key: str = Header(None, alias="Idempotency-Key")):
    key = idempotency_key or payload.submission_id
    
    # Idempotency lookup via Supabase
    if supabase:
        existing_res = supabase.table("reports").select("*").eq("submission_id", key).execute()
        if existing_res.data and len(existing_res.data) > 0:
            existing = existing_res.data[0]
            existing["idempotent_replay"] = True
            return existing

    extraction_res = ai_intake_service.call_structured(payload.text, IntakeExtraction)
    
    if extraction_res["status"] == "success":
        data: IntakeExtraction = extraction_res["data"]
        ai_status = extraction_res["ai_status"]
    else:
        data = IntakeExtraction(summary=payload.text, is_civic_issue=True)
        ai_status = "PENDING"

    if data.injection_suspected:
        raise HTTPException(status_code=400, detail="Security violation: Prompt injection suspected.")

    category = CategoryEnum(data.category) if data.category in [c.value for c in CategoryEnum] else CategoryEnum.OTHER
    priority = calculate_rules_priority(data.reported_urgency, data.is_civic_issue)
    department = route_to_department(category)
    evidence_conf = calculate_evidence_confidence(bool(payload.image_url), bool(payload.latitude))
    spam_val = evaluate_spam_risk(payload.text)
    
    public_id = f"CV-{random.randint(1000, 9999)}"
    internal_id = f"uuid-{random.randint(10000, 99999)}"

    response_obj = {
        "public_id": public_id,
        "internal_id": internal_id,
        "submission_id": payload.submission_id,
        "status": IncidentStatusEnum.RECEIVED,
        "ai_status": ai_status,
        "category": category,
        "reported_urgency": data.reported_urgency,
        "priority": priority,
        "evidence_confidence": evidence_conf,
        "supporting_signals": [
            {"signal": "consistent_category", "detail": f"Matched category {category.value}", "impact": "+"}
        ],
        "spam_risk": spam_val,
        "idempotent_replay": False
    }

    incident_obj = {
        "incident_id": public_id,
        "category": category,
        "title": f"Incident regarding {category.value}",
        "summary": data.summary,
        "location": {"latitude": payload.latitude, "longitude": payload.longitude, "landmark": payload.landmark_text},
        "priority": priority,
        "evidence_confidence": evidence_conf,
        "supporting_signals": response_obj["supporting_signals"],
        "spam_risk": spam_val,
        "report_count": 1,
        "department": department,
        "status": IncidentStatusEnum.RECEIVED,
        "response_plan": generate_response_plan(category),
        "reported_urgency": data.reported_urgency
    }

    if supabase:
        supabase.table("reports").insert(response_obj).execute()
        supabase.table("incidents").upsert(incident_obj).execute()

    return response_obj

@router.get("/{public_id}", response_model=ReportResponse)
def get_report(public_id: str):
    if supabase:
        res = supabase.table("reports").select("*").eq("public_id", public_id).execute()
        if res.data and len(res.data) > 0:
            return res.data[0]
    raise HTTPException(status_code=404, detail="Report not found")
    
