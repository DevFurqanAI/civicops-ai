from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, status
from backend.database import get_reports_repository, get_incidents_repository
from backend.models.report import ReportCreate, ReportResponse, TrackingDetailsResponse
from backend.models.common import CategoryEnum
from backend.auth import optional_user, require_report_access
from backend.services.ai_intake import ai_intake_service, IntakeExtraction
from backend.services.evidence_engine import calculate_evidence_confidence
from backend.services.spam_detection import evaluate_spam_risk
from backend.services.report_adapter import request_metadata, validate_replay, report_response
from backend.services.incident_fusion import IncidentFusionService

router = APIRouter(prefix="/api/reports", tags=["Reports"])


def normalize_reported_urgency(value: str) -> str | None:
    """Persist a recognized citizen claim; absence is not a MEDIUM claim."""
    normalized = value.strip().upper()
    return normalized if normalized in {"LOW", "MEDIUM", "HIGH", "CRITICAL"} else None


def finish(row, replay, incidents):
    if row["injection_suspected"]:
        raise HTTPException(400, "Security violation: Prompt injection suspected.")
    incident = IncidentFusionService(incidents).process(row)
    return report_response(row, replay, incident)


@router.post("", response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
def create_report(payload: ReportCreate,
                  idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
                  repository=Depends(get_reports_repository),
                  incidents=Depends(get_incidents_repository), user=Depends(optional_user)):
    key = idempotency_key if idempotency_key is not None else payload.submission_id
    if not key.strip():
        raise HTTPException(422, "Idempotency key must not be empty")
    scope = "USER:" + user.user_id if user else "PUBLIC"
    existing = repository.by_submission(scope, key)
    if existing:
        validate_replay(existing, payload)
        return finish(existing, True, incidents)

    extraction = ai_intake_service.call_structured(payload.text, IntakeExtraction)
    processed = extraction["status"] == "success"
    data = extraction["data"] if processed else IntakeExtraction(category=CategoryEnum.OTHER, summary=payload.text)
    category = data.category
    signals = ([{"signal": "consistent_category", "detail": f"Matched category {category.value}",
                 "impact": "+"}] if processed else [])
    signals.append(request_metadata(payload))
    row = {
        "submission_id": key, "idempotency_scope": scope, "source_channel": "WEB",
        "reporter_id": user.user_id if user else None,
        "text": payload.text, "language": payload.language,
        "latitude": payload.latitude, "longitude": payload.longitude,
        "landmark_text": payload.landmark_text,
        "ai_summary": data.summary if processed else None,
        "ai_status": "PROCESSED" if processed else "PENDING",
        "is_civic_issue": data.is_civic_issue if processed else None,
        "injection_suspected": data.injection_suspected if processed else False,
        "ai_processed_at": datetime.now(timezone.utc).isoformat() if processed else None,
        "ai_error": None if processed else "AI intake unavailable; processing pending",
        "category": category.value if processed else None,
        "reported_urgency": normalize_reported_urgency(data.reported_urgency) if processed else None,
        "processing_status": ("REJECTED" if data.injection_suspected or not data.is_civic_issue
                              else "PROCESSED") if processed else "AI_PENDING",
        "evidence_confidence": calculate_evidence_confidence(
            bool(payload.image_url), payload.latitude is not None and payload.longitude is not None),
        "supporting_signals": signals, "spam_risk": evaluate_spam_risk(payload.text),
    }
    stored, replay = repository.insert(row)
    if replay:
        validate_replay(stored, payload)
    return finish(stored, replay, incidents)


@router.get("/{public_id}", response_model=ReportResponse)
def get_report(public_id: str, repository=Depends(get_reports_repository), incidents=Depends(get_incidents_repository), user=Depends(optional_user)):
    row = repository.by_public_id(public_id)
    if row is None:
        raise HTTPException(404, "Report not found")
    require_report_access(row, user)
    link = incidents.link_for_report(row["id"])
    incident = incidents.find("incidents", "id", link["incident_id"]) if link else None
    return report_response(row, incident=incident)


@router.get("/{public_id}/tracking", response_model=TrackingDetailsResponse)
def tracking_details(public_id: str, repository=Depends(get_reports_repository),
                     incidents=Depends(get_incidents_repository), user=Depends(optional_user)):
    row = repository.by_public_id(public_id)
    if row is None:
        raise HTTPException(404, "Report not found")
    require_report_access(row, user)
    link = incidents.link_for_report(row["id"])
    incident = incidents.find("incidents", "id", link["incident_id"]) if link else None
    history = incidents.rows("incident_status_history", (("eq", "incident_id", incident["id"]),)) if incident else []
    own = user is not None and user.role == "CITIZEN" and row.get("reporter_id") == user.user_id
    feedback = incidents.rows("resolution_feedback", (("eq", "report_id", row["id"]),
        ("eq", "incident_id", incident["id"]))) if own and incident else []
    return {
        "public_id": row["public_id"],
        "incident_code": incident["incident_code"] if incident else None,
        "location": {"latitude": row.get("latitude"), "longitude": row.get("longitude"), "landmark": row.get("landmark_text")},
        "history": [{"old_status": event.get("old_status"), "new_status": event["new_status"],
                     "created_at": event["created_at"]} for event in sorted(history, key=lambda event: (event["created_at"], event["id"]))],
        "can_submit_feedback": bool(own and incident and incident["status"] == "RESOLVED" and not feedback),
        "feedback_response": feedback[0]["response"] if feedback else None,
    }
