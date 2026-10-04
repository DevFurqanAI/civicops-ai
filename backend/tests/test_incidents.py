"""Deterministic fusion integration tests against the actual Supabase query builder."""
import json
import subprocess
import sys
from pathlib import Path
from uuid import uuid4

import pytest
from postgrest.exceptions import APIError

from test_reports import setup
from backend.models.common import DepartmentEnum, IncidentStatusEnum
from backend.repositories.incidents import IncidentsRepository, stable_id
from backend.services.ai_intake import IntakeExtraction, ai_intake_service
from backend.services.routing_engine import route_to_department

TEXT = "Deep pothole blocking vehicles at Beacon school gate 2"


@pytest.fixture
def fusion(setup, monkeypatch):
    client, database = setup
    monkeypatch.setattr(ai_intake_service, "call_structured", lambda text, _: {
        "status": "success", "data": IntakeExtraction(
            category="STREET_LIGHTING" if "street lights" in text else "ROAD_DAMAGE",
            summary=text, reported_urgency="High" if "danger" in text else "Medium")})
    return client, database


def submit(client, text=TEXT, **changes):
    return client.post("/api/reports", json={"submission_id": str(uuid4()), "text": text,
        "language": "en", "latitude": 31.5204, "longitude": 74.3587,
        "landmark_text": "Beacon school gate 2", **changes})


def test_first_report_creates_persistent_incident(fusion):
    client, database = fusion
    response = submit(client)
    assert response.status_code == 201
    incident_id = response.json()["incident_id"]
    incident = client.get(f"/api/incidents/{incident_id}").json()
    assert incident["incident_id"] == incident_id
    assert incident["incident_code"].startswith("INC-")
    assert incident["report_count"] == 1
    assert incident["status"] == "RECEIVED"
    assert incident["department"] == "ROAD_MAINTENANCE"
    assert incident["response_plan_status"] == "PENDING"
    assert database.rows()[0]["processing_status"] == "LINKED"
    link = database.rows("incident_reports")[0]
    assert link["match_method"] == "NEW_INCIDENT_V1"
    assert link["match_details"]["decision"] == "NEW_INCIDENT"
    assert len(database.rows("incident_status_history")) == 1
    assert client.get("/api/incidents").json() == [incident]
    assert client.get("/api/incidents/" + incident["incident_code"]).json() == incident
    assert client.get("/api/incidents/" + response.json()["public_id"]).json() == incident


def test_matching_report_joins_and_aggregates(fusion):
    client, database = fusion
    first = submit(client).json()
    second = submit(client, TEXT + " today danger", latitude=31.52042).json()
    assert second["incident_id"] == first["incident_id"]
    assert len(database.rows("incidents")) == 1
    assert len(database.rows("incident_reports")) == 2
    incident = client.get("/api/incidents/" + first["incident_id"]).json()
    assert incident["report_count"] == 2
    assert incident["priority"] == "HIGH"
    assert incident["summary"] == TEXT
    assert incident["evidence_confidence"] == pytest.approx(.8)  # no count-based inflation
    assert incident["spam_risk"] == pytest.approx(.05)
    matched = next(link for link in database.rows("incident_reports") if link["report_id"] == second["internal_id"])
    assert matched["match_method"] == "TOKEN_SIMILARITY_DISTANCE_TIME_V1"
    assert matched["match_score"] >= .85
    assert matched["match_details"]["distance_metres"] < 40
    assert matched["match_details"]["independent_sources_verified"] is False
    assert client.get("/api/reports/" + first["public_id"]).json()["priority"] == "HIGH"


@pytest.mark.parametrize("changes", [
    {"text": "Bridge collapsed across canal blocking heavy trucks"},
    {"latitude": 31.8, "longitude": 74.8},
    {"text": "Broken street lights at Beacon school gate 2"},
    {"landmark_text": "Main road"},
])
def test_uncertain_or_different_report_does_not_merge(fusion, changes):
    client, database = fusion
    first = submit(client).json()
    changes = dict(changes)
    text = changes.pop("text", TEXT)
    second = submit(client, text, **changes).json()
    assert first["incident_id"] != second["incident_id"]
    assert len(database.rows("incidents")) == 2


def test_identical_wording_on_same_generic_road_does_not_merge(fusion):
    client, _ = fusion
    first = submit(client, landmark_text="Main road").json()
    second = submit(client, landmark_text="Main road").json()
    assert first["incident_id"] != second["incident_id"]


def test_named_road_alone_is_not_specific_enough(fusion):
    client, _ = fusion
    first = submit(client, landmark_text="Main road Gulberg").json()
    second = submit(client, landmark_text="Main road Gulberg").json()
    assert first["incident_id"] != second["incident_id"]


def test_temporal_proximity_is_required(fusion):
    client, database = fusion
    first = submit(client).json()
    sdk = database.client()
    try:
        sdk.table("incidents").update({"created_at": "2026-10-01T12:00:00+00:00"}).eq("id", first["incident_id"]).execute()
        second = submit(client).json()
        assert first["incident_id"] != second["incident_id"]
    finally:
        sdk.postgrest.aclose()


def test_two_equally_plausible_incidents_are_not_forced_to_merge(fusion):
    client, database = fusion
    first = submit(client).json()
    second = submit(client, latitude=32).json()
    sdk = database.client()
    try:
        sdk.table("reports").update({"latitude": 31.5204}).eq("id", second["internal_id"]).execute()
        sdk.table("incidents").update({"latitude": 31.5204}).eq("id", second["incident_id"]).execute()
        third = submit(client).json()
        assert third["incident_id"] not in {first["incident_id"], second["incident_id"]}
        link = next(r for r in database.rows("incident_reports") if r["report_id"] == third["internal_id"])
        assert link["match_details"]["reason"] == "ambiguous_candidates"
    finally:
        sdk.postgrest.aclose()


def test_high_spam_risk_does_not_auto_merge(fusion, monkeypatch):
    client, _ = fusion
    first = submit(client).json()
    monkeypatch.setattr("backend.routes.reports.evaluate_spam_risk", lambda _: .8)
    second = submit(client).json()
    assert second["incident_id"] != first["incident_id"]


def test_missing_coordinates_require_exact_specific_landmark(fusion):
    client, _ = fusion
    first = submit(client, latitude=None, longitude=None).json()
    second = submit(client, latitude=None, longitude=None).json()
    assert first["incident_id"] == second["incident_id"]
    third = submit(client, latitude=None, longitude=None, landmark_text="Beacon school gate 3").json()
    assert third["incident_id"] != first["incident_id"]


def test_one_report_cannot_link_to_two_incidents(fusion):
    client, database = fusion
    first = submit(client).json()
    second = submit(client, latitude=32).json()
    sdk = database.client()
    try:
        with pytest.raises(APIError) as duplicate:
            sdk.table("incident_reports").insert({"id": str(uuid4()),
                "incident_id": second["incident_id"], "report_id": first["internal_id"],
                "match_score": .99, "match_method": "test", "match_details": {}}).execute()
        assert duplicate.value.code == "23505"
        # Repository race recovery returns the existing winning link, never reassigns it.
        winner = IncidentsRepository(sdk).insert_once("incident_reports", {"id": str(uuid4()),
            "incident_id": second["incident_id"], "report_id": first["internal_id"],
            "match_score": .99, "match_method": "test", "match_details": {}}, lookup_field="report_id")
        assert winner["incident_id"] == first["incident_id"]
    finally:
        sdk.postgrest.aclose()
    assert len(database.rows("incident_reports")) == 2


def test_audit_events_are_durable_and_replay_is_idempotent(fusion):
    client, database = fusion
    submission = str(uuid4())
    first = submit(client, submission_id=submission).json()
    replay = submit(client, submission_id=submission).json()
    assert replay == {**first, "idempotent_replay": True}
    events = database.rows("audit_logs")
    assert {event["action"] for event in events} == {"INCIDENT_CREATED", "REPORT_LINKED", "AUTOMATIC_MATCH_DECISION"}
    assert len(events) == 3
    assert all(event["actor_type"] == "SYSTEM" for event in events)
    assert TEXT not in json.dumps(events)
    assert all("_intake_request_v1" not in json.dumps(event) for event in events)
    assert client.get("/api/incidents/" + first["incident_id"]).json()["report_count"] == 1


def test_incidents_survive_fresh_interpreter(fusion):
    client, database = fusion
    first = submit(client).json()
    original = client.get("/api/incidents/" + first["incident_id"]).json()
    script = '''
import sys, json
sys.path.insert(0, "backend/tests")
from test_reports import DatabaseTransport
from backend import main
from fastapi.testclient import TestClient
database = DatabaseTransport(sys.argv[1])
main.create_backend_client = database.client
from backend.auth import operator_user, CurrentUser
main.app.dependency_overrides[operator_user] = lambda: CurrentUser("00000000-0000-0000-0000-000000000001", "OPERATOR")
with TestClient(main.app) as client:
    print(json.dumps(client.get("/api/incidents/" + sys.argv[2]).json()))
'''
    result = subprocess.run([sys.executable, "-c", script, str(database.path), first["incident_id"]],
        cwd=Path(__file__).resolve().parents[2], capture_output=True, text=True, timeout=20)
    assert result.returncode == 0
    assert json.loads(result.stdout) == original


def test_audit_failure_recovers_on_report_retry(fusion):
    client, database = fusion
    submission = str(uuid4())
    database.fail_table = "audit_logs"
    failed = submit(client, submission_id=submission)
    assert failed.status_code == 503
    assert len(database.rows("incidents")) == 1
    assert len(database.rows("incident_reports")) == 1
    assert database.rows()[0]["processing_status"] == "PROCESSED"
    database.fail_table = None
    retried = submit(client, submission_id=submission)
    assert retried.status_code == 201
    assert retried.json()["idempotent_replay"] is True
    assert len(database.rows("audit_logs")) == 3
    assert len(database.rows("incidents")) == 1
    assert database.rows()[0]["processing_status"] == "LINKED"


def test_link_failure_recovers_without_creating_another_incident(fusion):
    client, database = fusion
    submission = str(uuid4())
    database.fail_insert_table = "incident_reports"
    assert submit(client, submission_id=submission).status_code == 503
    assert len(database.rows("incidents")) == 1
    assert not database.rows("incident_reports")
    database.fail_insert_table = None
    assert submit(client, submission_id=submission).status_code == 201
    assert len(database.rows("incidents")) == 1
    assert len(database.rows("incident_reports")) == 1
    assert len(database.rows("audit_logs")) == 3


def test_operator_state_is_preserved_and_stale_aggregate_is_rejected(fusion):
    client, database = fusion
    first = submit(client).json()
    sdk = database.client()
    repository = IncidentsRepository(sdk)
    try:
        old = repository.find("incidents", "id", first["incident_id"])
        repository.update_incident(old, {"status": "IN_PROGRESS", "priority": "CRITICAL",
                                        "updated_at": "2026-10-04T13:00:00+00:00"})
        assert repository.update_incident(old, {"priority": "LOW"}) == []
        second = submit(client).json()
        assert second["incident_id"] == first["incident_id"]
        incident = client.get("/api/incidents/" + first["incident_id"]).json()
        assert incident["status"] == "IN_PROGRESS"
        assert incident["priority"] == "CRITICAL"
        assert incident["report_count"] == 2
    finally:
        sdk.postgrest.aclose()


def test_closed_incident_is_not_automatically_reopened(fusion):
    client, database = fusion
    first = submit(client).json()
    sdk = database.client()
    try:
        sdk.table("incidents").update({"status": "RESOLVED"}).eq("id", first["incident_id"]).execute()
        second = submit(client).json()
        assert second["incident_id"] != first["incident_id"]
    finally:
        sdk.postgrest.aclose()


def test_operational_writes_require_trusted_profile(fusion):
    client, _ = fusion
    first = submit(client).json()
    # The older fusion fixture grants a route-level test role, but the RPC also
    # requires an actual trusted profiles row. It does not trust this override.
    assert client.post("/api/incidents/" + first["incident_id"] + "/status", json={"status":"VERIFIED"}).status_code == 403
    assert client.get("/api/incidents/" + first["incident_id"]).json()["status"] == "RECEIVED"
    assert IncidentStatusEnum.REOPENED.value == "REOPENED"
    assert route_to_department("WATER_SUPPLY") is DepartmentEnum.WATER_SUPPLY


def test_pending_reports_have_no_incident(fusion, monkeypatch):
    client, database = fusion
    monkeypatch.setattr(ai_intake_service, "call_structured", lambda *args: {"status": "pending_fallback"})
    response = submit(client)
    assert response.status_code == 201
    assert response.json()["incident_id"] is None
    assert not database.rows("incidents")
    assert not database.rows("incident_reports")
