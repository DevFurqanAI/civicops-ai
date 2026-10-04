"""Conservative lexical matching; no embeddings or independent-source verification."""
import math
import re
import unicodedata
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from backend.repositories.incidents import stable_id
from backend.services.priority_engine import calculate_rules_priority
from backend.services.report_adapter import REQUEST_SIGNAL
from backend.services.routing_engine import route_to_department
from backend.services.response_planner import generate_response_plan

METHOD = "TOKEN_SIMILARITY_DISTANCE_TIME_V1"
ACTIVE_STATUSES = {"RECEIVED", "VERIFIED", "ASSIGNED", "IN_PROGRESS", "REOPENED", "NEEDS_REVIEW"}
# Generic roads/areas and institution types alone do not identify a particular site.
GENERIC_LOCATION = {"main", "road", "street", "gali", "sadak", "sarak", "avenue", "school",
                    "market", "park", "near", "outside", "opposite", "front", "the", "at", "of",
                    "in", "gate", "junction", "intersection", "college", "hospital"}
SITE_MARKERS = {"school", "hospital", "college", "gate", "building", "house", "plot", "shop",
                "pole", "bridge", "block", "sector", "junction", "intersection"}


def tokens(text):
    return set(re.findall(r"[^\W_]+", unicodedata.normalize("NFKC", text or "").casefold()))


def similarity(left, right):
    a, b = tokens(left), tokens(right)
    return len(a & b) / len(a | b) if a and b else 0.0


def timestamp(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def distance_m(a, b):
    values = [a.get("latitude"), a.get("longitude"), b.get("latitude"), b.get("longitude")]
    if any(v is None for v in values):
        return None
    lat1, lon1, lat2, lon2 = map(math.radians, values)
    h = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return 6371000 * 2 * math.asin(math.sqrt(min(1, h)))


def evaluate_match(report, incident, anchor):
    hours = abs((timestamp(report["created_at"]) - timestamp(anchor["created_at"])).total_seconds()) / 3600
    metres = distance_m(report, anchor)
    text_score = similarity(report["text"], anchor["text"])
    summary_score = similarity(report.get("ai_summary"), anchor.get("ai_summary"))
    # Both original text and summary must agree: generic LLM summaries cannot merge different reports.
    content_score = min(text_score, summary_score) if report.get("ai_summary") and anchor.get("ai_summary") else text_score
    landmark_score = similarity(report.get("landmark_text"), anchor.get("landmark_text"))
    report_location, anchor_location = tokens(report.get("landmark_text")), tokens(anchor.get("landmark_text"))
    shared_location = report_location & anchor_location
    specific = bool((shared_location - GENERIC_LOCATION) and (shared_location & SITE_MARKERS))
    has_location = all(r.get("latitude") is not None and r.get("longitude") is not None for r in (report, anchor))
    temporal_score = max(0, 1 - hours / 24)
    if has_location:
        geo_score = max(0, 1 - (metres or 0) / 100)
        score = .35 * content_score + .30 * landmark_score + .25 * geo_score + .10 * temporal_score
        eligible = metres <= 40 and hours <= 24 and landmark_score >= .85 and content_score >= .75 and score >= .85
    else:
        # Without coordinates, require an exact specific landmark, stronger text and a shorter window.
        score = .60 * content_score + .30 * landmark_score + .10 * temporal_score
        eligible = report_location == anchor_location and len(report_location) >= 3 and hours <= 6 and content_score >= .90 and score >= .94
    eligible = (eligible and specific and len(tokens(report["text"])) >= 4
                and incident["category"] == report["category"] and report["category"] != "OTHER"
                and incident["status"] in ACTIVE_STATUSES and incident.get("archived_at") is None
                and max(report["spam_risk"], anchor["spam_risk"]) < .5)
    return {"eligible": bool(eligible), "score": round(score, 6), "method": METHOD,
        "details": {"algorithm": METHOD, "anchor_report_id": anchor["id"],
            "distance_metres": round(metres, 2) if metres is not None else None,
            "hours_apart": round(hours, 3), "text_similarity": round(text_score, 6),
            "summary_similarity": round(summary_score, 6), "landmark_similarity": round(landmark_score, 6),
            "specific_landmark": specific, "coordinates_available": has_location,
            "max_distance_metres": 40, "max_hours": 24 if has_location else 6,
            "independent_sources_verified": False, "media_corroborated": False}}


def report_priority(report):
    return calculate_rules_priority(report.get("reported_urgency") or "Medium", report.get("is_civic_issue") is not False).value


def aggregate(incident, reports):
    ranks = {"LOW": 0, "MEDIUM": 1, "HIGH": 2, "CRITICAL": 3}
    # Do not lower an operator's existing priority. Operational fields are never overwritten.
    priority = max([incident["priority"]] + [report_priority(r) for r in reports], key=ranks.__getitem__)
    signals = []
    seen = set()
    for report in reports:
        for signal in report["supporting_signals"]:
            if signal.get("signal") == REQUEST_SIGNAL:
                continue
            key = (signal.get("signal"), signal.get("detail"), signal.get("impact"))
            if key not in seen:
                seen.add(key)
                signals.append(signal)
    signals.append({"signal": "linked_report_count", "detail": f"{len(reports)} linked submissions; independent sources not verified", "impact": "informational"})
    return {"priority": priority, "evidence_confidence": max([incident["evidence_confidence"]] + [r["evidence_confidence"] for r in reports]),
        "spam_risk": max([incident["spam_risk"]] + [r["spam_risk"] for r in reports]),
        "supporting_signals": signals, "updated_at": datetime.now(timezone.utc).isoformat()}


class IncidentFusionService:
    def __init__(self, repository):
        self.repository = repository

    def audit(self, action, incident_id, report_id=None, details=None):
        identity = f"{incident_id}:{report_id or ''}:{action}"
        return self.repository.insert_once("audit_logs", {"id": stable_id("audit", identity),
            "actor_type": "SYSTEM", "actor_id": None, "action": action,
            "incident_id": incident_id, "report_id": report_id, "details": details or {}})

    def repair_link(self, report, link):
        repository = self.repository
        incident = repository.find("incidents", "id", link["incident_id"])
        if not incident:
            raise HTTPException(503, "Linked incident unavailable")
        # Event IDs make these steps recoverable after a partial multi-request failure.
        self.audit("INCIDENT_CREATED", incident["id"], details={"status": "RECEIVED", "response_plan_status": "PENDING"})
        repository.insert_once("incident_status_history", {"id": stable_id("initial_status", incident["id"]),
            "incident_id": incident["id"], "old_status": None, "new_status": "RECEIVED", "notes": "Initial system intake"})
        self.audit("AUTOMATIC_MATCH_DECISION", incident["id"], report["id"], link["match_details"])
        self.audit("REPORT_LINKED", incident["id"], report["id"], {
            "match_score": link["match_score"], "match_method": link["match_method"]})
        for _ in range(5):
            incident = repository.find("incidents", "id", incident["id"])
            reports = repository.linked_reports(incident["id"])
            updated = repository.update_incident(incident, aggregate(incident, reports))
            if updated:
                repository.mark_linked(report["id"])
                return updated[0]
        raise HTTPException(503, "Incident aggregation busy; retry this submission")

    def process(self, report):
        if (report["ai_status"] != "PROCESSED" or report["processing_status"] not in {"PROCESSED", "LINKED"}
                or report.get("injection_suspected") or report.get("is_civic_issue") is False
                or report.get("archived_at") is not None):
            return None
        repository = self.repository
        existing_link = repository.link_for_report(report["id"])
        if existing_link:
            return self.repair_link(report, existing_link)
        # Reuse a deterministic seed if an earlier attempt created it before linking failed.
        seed_id = stable_id("incident_seed", report["id"])
        seed = repository.find("incidents", "id", seed_id)
        evaluated = []
        if not seed:
            created_at = timestamp(report["created_at"])
            candidates = repository.candidates(report["category"], (created_at - timedelta(hours=24)).isoformat(), created_at.isoformat())
            for candidate in candidates:
                linked = repository.linked_reports(candidate["id"])
                if not linked:
                    continue
                # Anchor to the seed report; do not let chains drift across locations.
                seed_link = next((link for link in repository.rows("incident_reports", (("eq", "incident_id", candidate["id"]),))
                                  if link["match_method"] == "NEW_INCIDENT_V1"), None)
                anchor = next((r for r in linked if seed_link and r["id"] == seed_link["report_id"]), linked[0])
                result = evaluate_match(report, candidate, anchor)
                evaluated.append({"incident_id": candidate["id"], **result})
        acceptable = sorted((e for e in evaluated if e["eligible"]), key=lambda e: (-e["score"], e["incident_id"]))
        ambiguous = len(acceptable) > 1 and acceptable[0]["score"] - acceptable[1]["score"] < .08
        decision = {"algorithm": METHOD, "candidate_count": len(evaluated),
            "decision": "NEW_INCIDENT", "reason": "ambiguous_candidates" if ambiguous else "no_confident_match",
            "evaluated_candidates": [{"incident_id": e["incident_id"], "eligible": e["eligible"], "score": e["score"], **e["details"]} for e in evaluated[:20]]}
        if acceptable and not ambiguous:
            winner = acceptable[0]
            incident_id, score, method = winner["incident_id"], winner["score"], METHOD
            decision.update({"decision": "LINK_EXISTING", "reason": "strong_location_text_time_agreement", **winner["details"]})
        else:
            department = repository.department(route_to_department(report["category"]).value)
            incident = seed or repository.insert_once("incidents", {
                "id": seed_id, "incident_code": "INC-" + seed_id.replace("-", "").upper(),
                "category": report["category"], "title": f"Incident regarding {report['category']}",
                "summary": report.get("ai_summary") or report["text"],
                "latitude": report.get("latitude"), "longitude": report.get("longitude"),
                "landmark_text": report.get("landmark_text"), "location_confidence": report.get("location_confidence"),
                "priority": report_priority(report), "evidence_confidence": report["evidence_confidence"],
                "spam_risk": report["spam_risk"], "supporting_signals": [],
                "status": "RECEIVED", "current_department_id": department["id"],
                "created_at": report["created_at"],
                "response_plan": generate_response_plan(report["category"]), "response_plan_status": "PENDING"})
            incident_id, score, method = incident["id"], None, "NEW_INCIDENT_V1"
        link = repository.insert_once("incident_reports", {"id": stable_id("report_link", report["id"]),
            "report_id": report["id"], "incident_id": incident_id, "match_score": score,
            "match_method": method, "match_details": decision}, lookup_field="report_id")
        return self.repair_link(report, link)
