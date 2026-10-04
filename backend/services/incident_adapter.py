"""Join persistent intelligence into the existing incident-facing API shape."""
from backend.services.incident_fusion import report_priority


def incident_response(repository, incident):
    reports = repository.linked_reports(incident["id"])
    department = repository.find("departments", "id", incident["current_department_id"]) if incident.get("current_department_id") else None
    ranks = {"LOW": 0, "MEDIUM": 1, "HIGH": 2, "CRITICAL": 3}
    urgency = max(reports, key=lambda r: ranks[report_priority(r)]).get("reported_urgency") if reports else None
    return {
        "incident_id": incident["id"], "updated_at": incident["updated_at"], "incident_code": incident["incident_code"],
        "category": incident["category"], "title": incident["title"], "summary": incident.get("summary") or "",
        "location": {"latitude": incident.get("latitude"), "longitude": incident.get("longitude"), "landmark": incident.get("landmark_text")},
        "priority": incident["priority"], "evidence_confidence": incident["evidence_confidence"],
        "supporting_signals": incident["supporting_signals"], "spam_risk": incident["spam_risk"],
        "report_count": len(reports), "department": department["department_key"] if department else "MANUAL_REVIEW",
        "status": incident["status"], "response_plan": incident["response_plan"],
        "response_plan_status": incident["response_plan_status"], "reported_urgency": urgency or "Medium",
    }
