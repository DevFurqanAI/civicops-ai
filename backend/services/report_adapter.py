"""Keep report processing separate from the legacy operational response contract."""
import hashlib
import json

from fastapi import HTTPException
from backend.models.common import IncidentStatusEnum
from backend.services.priority_engine import calculate_rules_priority

REQUEST_SIGNAL = "_intake_request_v1"


def request_metadata(payload):
    values = payload.model_dump(mode="json")
    values.pop("submission_id")
    digest = hashlib.sha256(json.dumps(values, sort_keys=True, separators=(",", ":"),
                                      ensure_ascii=False).encode()).hexdigest()
    # reports has no payload-hash column. Keep private intake metadata in its JSONB
    # signals, filtering it out of public evidence. Includes image_url in the hash.
    return {"signal": REQUEST_SIGNAL, "detail": json.dumps({
        "payload_hash": digest, "submission_id": payload.submission_id}), "impact": "internal"}


def metadata(row):
    for signal in row["supporting_signals"]:
        if signal.get("signal") == REQUEST_SIGNAL:
            return json.loads(signal["detail"])
    raise HTTPException(409, "Existing report lacks retry metadata; cannot safely replay")


def validate_replay(row, payload):
    if metadata(row)["payload_hash"] != json.loads(request_metadata(payload)["detail"])["payload_hash"]:
        raise HTTPException(409, "Idempotency key already used for a different report payload")


def report_response(row, replay=False, incident=None):
    return {
        "public_id": row["public_id"], "internal_id": row["id"],
        "incident_id": incident["id"] if incident else None,
        "submission_id": next((json.loads(s["detail"])["submission_id"]
                               for s in row["supporting_signals"]
                               if s.get("signal") == REQUEST_SIGNAL), row["submission_id"]),
        "status": incident["status"] if incident else IncidentStatusEnum.RECEIVED,
        "ai_status": row["ai_status"], "category": row["category"] or "OTHER",
        "reported_urgency": row["reported_urgency"] or "Medium",
        "priority": incident["priority"] if incident else calculate_rules_priority(
            row["reported_urgency"] or "Medium", row["is_civic_issue"] is not False),
        "evidence_confidence": row["evidence_confidence"],
        "supporting_signals": [s for s in row["supporting_signals"]
                               if s.get("signal") != REQUEST_SIGNAL],
        "spam_risk": row["spam_risk"], "idempotent_replay": replay,
    }
