"""Exercise the real Supabase query builder against a disk-backed test transport.

No production credentials or external API calls are used.
"""
import json
import sqlite3
import subprocess
import sys
from pathlib import Path
from uuid import UUID

import httpx
import pytest
from fastapi.testclient import TestClient
from supabase import ClientOptions, create_client

from backend import main
from backend.database import create_backend_client
from backend.services.ai_intake import AIIntakeService, IntakeExtraction, ai_intake_service


class DatabaseTransport:
    """Disk-backed PostgREST simulator with production uniqueness and JSON columns."""
    def __init__(self, path):
        self.path = path
        self.collision = False
        self.race = False
        self.unavailable = False
        self.fail_table = None
        self.fail_insert_table = None
        with sqlite3.connect(path) as db:
            db.execute("CREATE TABLE IF NOT EXISTS records (table_name TEXT, id TEXT, payload TEXT, PRIMARY KEY(table_name,id))")
            for name, columns, table in (
                ("report_submission", "json_extract(payload,'$.idempotency_scope'),json_extract(payload,'$.submission_id')", "reports"),
                ("report_public", "json_extract(payload,'$.public_id')", "reports"),
                ("one_incident_per_report", "json_extract(payload,'$.report_id')", "incident_reports"),
                ("incident_code", "json_extract(payload,'$.incident_code')", "incidents"),
            ):
                db.execute(f"CREATE UNIQUE INDEX IF NOT EXISTS {name} ON records ({columns}) WHERE table_name='{table}'")
            from backend.models.common import DepartmentEnum
            from backend.repositories.incidents import stable_id
            for department in DepartmentEnum:
                row = {"id": stable_id("department", department.value), "department_key": department.value, "is_active": True}
                db.execute("INSERT OR IGNORE INTO records VALUES (?, ?, ?)", ("departments", row["id"], json.dumps(row)))

    def handle(self, request):
        if "/rpc/" in request.url.path:
            return self.handle_rpc(request)
        table = request.url.path.rsplit("/",1)[-1]
        if self.unavailable or self.fail_table == table or (request.method == "POST" and self.fail_insert_table == table):
            return httpx.Response(500, json={"code": "XX000", "message": "private database detail", "details": None, "hint": None})
        def matches(row):
            for field, value in request.url.params.multi_items():
                if field in {"select", "limit", "offset", "order"}:
                    continue
                operation, expected = value.split(".",1)
                actual = row.get(field)
                if operation == "eq" and str(actual) != expected:
                    return False
                if operation == "gte" and (actual is None or actual < expected):
                    return False
                if operation == "lte" and (actual is None or actual > expected):
                    return False
                if operation == "is" and expected == "null" and actual is not None:
                    return False
                if operation == "in" and str(actual) not in expected.strip("()").split(","):
                    return False
            return True
        with sqlite3.connect(self.path) as db:
            if request.method == "POST":
                row = json.loads(request.content)
                if table == "reports" and self.collision:
                    self.collision = False
                    return httpx.Response(409, json={"code": "23505", "message": "public ID collision", "details": None, "hint": None})
                from datetime import datetime, timedelta, timezone
                count = db.execute("SELECT count(*) FROM records WHERE table_name='reports'").fetchone()[0]
                created = (datetime(2026,10,4,12,tzinfo=timezone.utc) + timedelta(seconds=count)).isoformat()
                row.setdefault("created_at", created)
                row.setdefault("updated_at", row["created_at"])
                if table == "incidents":
                    row.setdefault("archived_at", None)
                try:
                    db.execute("INSERT INTO records VALUES (?, ?, ?)", (table,row["id"],json.dumps(row)))
                except sqlite3.IntegrityError:
                    return httpx.Response(409, json={"code": "23505", "message": "duplicate", "details": None, "hint": None})
                if table == "reports" and self.race:
                    self.race = False
                    return httpx.Response(409, json={"code": "23505", "message": "concurrent winner", "details": None, "hint": None})
                return httpx.Response(201, json=[row])
            rows = [json.loads(r[0]) for r in db.execute("SELECT payload FROM records WHERE table_name=?",(table,))]
            rows = [row for row in rows if matches(row)]
            if request.method == "PATCH":
                values = json.loads(request.content)
                for row in rows:
                    row.update(values)
                    db.execute("UPDATE records SET payload=? WHERE table_name=? AND id=?",(json.dumps(row),table,row["id"]))
                return httpx.Response(200,json=rows)
            rows.sort(key=lambda row: row["id"])
            offset = int(request.url.params.get("offset",0))
            limit = int(request.url.params.get("limit",1000))
            return httpx.Response(200, json=rows[offset:offset+limit])

    def handle_rpc(self, request):
        # Deterministic transaction emulator; live verification tests the actual SQL.
        from datetime import datetime, timezone
        from uuid import uuid4
        name = request.url.path.rsplit("/", 1)[-1]
        p = json.loads(request.content)
        now = datetime.now(timezone.utc).isoformat()
        def response(code, message):
            return httpx.Response(int(code[2:]) if code.startswith("PT") else 500,
                json={"code": code, "message": message, "details": None, "hint": None})
        with sqlite3.connect(self.path) as db:
            def get(table, identity):
                row = db.execute("SELECT payload FROM records WHERE table_name=? AND id=?", (table, identity)).fetchone()
                return json.loads(row[0]) if row else None
            def save(table, row):
                db.execute("INSERT OR REPLACE INTO records VALUES (?,?,?)", (table, row["id"], json.dumps(row)))
            profile = get("profiles", p["p_actor_id"])
            feedback = name == "civicops_submit_resolution_feedback"
            if not profile or profile["role"] not in ({"CITIZEN"} if feedback else {"OPERATOR","ADMIN"}):
                return response("PT403", "Forbidden")
            i = get("incidents", p["p_incident_id"])
            if not i or i.get("archived_at"):
                return response("PT404", "Missing incident")
            if not feedback:
                expected = p.get("p_expected_updated_at")
                if not expected or datetime.fromisoformat(expected.replace("Z", "+00:00")) != datetime.fromisoformat(i["updated_at"].replace("Z", "+00:00")):
                    return response("PT409", "Stale version")
            audit = {"id": str(uuid4()), "actor_type": "USER" if feedback else profile["role"],
                     "actor_id": p["p_actor_id"], "incident_id": i["id"], "created_at": now, "details": {}}
            try:
                if name == "civicops_change_incident_status":
                    from backend.services.operations import STATUS_TRANSITIONS
                    target = p["p_new_status"]
                    if target not in STATUS_TRANSITIONS[i["status"]] or (target == "IN_PROGRESS" and i["response_plan_status"] != "APPROVED"):
                        return response("PT409", "Invalid transition")
                    old = i["status"]
                    i["status"] = target
                    if target == "RESOLVED": i["resolved_at"] = now
                    if target == "REOPENED": i["resolved_at"] = None
                    save("incident_status_history", {"id":str(uuid4()), "incident_id":i["id"],"old_status":old,"new_status":target,"notes":p.get("p_notes"),"changed_by":p["p_actor_id"],"created_at":now})
                    audit["action"] = "INCIDENT_STATUS_CHANGED"
                elif name == "civicops_assign_incident_department":
                    if i["status"] in {"RESOLVED","REJECTED"}: return response("PT409", "Closed incident")
                    for row in self.rows("incident_assignments"):
                        if row["incident_id"] == i["id"] and row.get("completed_at") is None:
                            row["completed_at"] = now; save("incident_assignments",row)
                    department = get("departments",p["p_department_id"])
                    if not department or not department["is_active"]:
                        db.rollback(); return response("PT422", "Invalid department")
                    save("incident_assignments", {"id":str(uuid4()),"incident_id":i["id"],"department_id":department["id"],"assigned_by":p["p_actor_id"],"assigned_at":now,"completed_at":None,"notes":p.get("p_notes")})
                    i["current_department_id"] = department["id"]
                    audit["action"] = "INCIDENT_DEPARTMENT_ASSIGNED"
                elif name == "civicops_review_incident_response_plan":
                    action = p["p_action"]
                    if i["status"] in {"RESOLVED","REJECTED"}: return response("PT409", "Closed incident")
                    if action == "APPROVE" and (not i["response_plan"] or i["response_plan_status"] not in {"PENDING","MODIFIED"}):
                        return response("PT409", "Invalid approval")
                    if action == "MODIFY": i["response_plan"] = p["p_response_plan"]
                    i["response_plan_status"] = {"APPROVE":"APPROVED","MODIFY":"MODIFIED","REJECT":"REJECTED"}[action]
                    i["response_plan_approved_by"] = p["p_actor_id"] if action == "APPROVE" else None
                    i["response_plan_approved_at"] = now if action == "APPROVE" else None
                    audit["action"] = "RESPONSE_PLAN_" + action
                elif feedback:
                    r = get("reports", p["p_report_id"])
                    links = self.rows("incident_reports")
                    if not r or r.get("reporter_id") != p["p_actor_id"] or not any(link["report_id"] == r["id"] and link["incident_id"] == i["id"] for link in links):
                        return response("PT403", "Not owned/linked")
                    if i["status"] != "RESOLVED": return response("PT409", "Not resolved")
                    if any(row["report_id"] == r["id"] and row["incident_id"] == i["id"] for row in self.rows("resolution_feedback")):
                        return httpx.Response(409,json={"code":"23505","message":"Duplicate feedback","details":None,"hint":None})
                    f = {"id":str(uuid4()),"report_id":r["id"],"incident_id":i["id"],"user_id":p["p_actor_id"],"response":p["p_response"],"comment":p.get("p_comment"),"created_at":now}
                    save("resolution_feedback",f)
                    audit.update(action="RESOLUTION_FEEDBACK_REVIEW_REQUESTED" if f["response"] == "NO" else "RESOLUTION_FEEDBACK_SUBMITTED", report_id=r["id"], details={"response":f["response"],"review_requested":f["response"] in {"NO","PARTIALLY"}})
                else: return response("PT422", "Unknown RPC")
                if self.fail_insert_table == "audit_logs": raise RuntimeError("Audit unavailable")
                save("audit_logs",audit)
                if not feedback:
                    i["updated_at"] = now; save("incidents",i)
                    return httpx.Response(200,json={"incident_id":i["id"],"updated_at":now,"status":i["status"]})
                return httpx.Response(200,json={"feedback_id":f["id"],"response":f["response"],"review_requested":f["response"] in {"NO","PARTIALLY"}})
            except Exception:
                db.rollback()
                return response("XX000", "Transaction failed")

    def rows(self, table="reports"):
        with sqlite3.connect(self.path) as db:
            return [json.loads(r[0]) for r in db.execute("SELECT payload FROM records WHERE table_name=?",(table,))]

    def client(self):
        return create_client("https://test.invalid", "test-only-key", options=ClientOptions(
            persist_session=False, auto_refresh_token=False,
            httpx_client=httpx.Client(transport=httpx.MockTransport(self.handle))))


@pytest.fixture
def setup(tmp_path, monkeypatch):
    database = DatabaseTransport(tmp_path / "reports.sqlite")
    monkeypatch.setattr(main, "create_backend_client", database.client)
    monkeypatch.setattr(ai_intake_service, "call_structured", lambda *args: {
        "status": "success", "ai_status": "PROCESSED", "data": IntakeExtraction(
            category="ROAD_DAMAGE", summary="Road needs repair", reported_urgency="High")})
    # Existing persistence/fusion tests exercise operator reads without live Auth.
    # Auth-specific tests remove this override and verify the real dependency.
    from backend.auth import operator_user, CurrentUser
    previous = main.app.dependency_overrides.get(operator_user)
    main.app.dependency_overrides[operator_user] = lambda: CurrentUser("00000000-0000-0000-0000-000000000001", "OPERATOR")
    try:
        with TestClient(main.app) as client:
            yield client, database
    finally:
        if previous is None:
            main.app.dependency_overrides.pop(operator_user, None)
        else:
            main.app.dependency_overrides[operator_user] = previous


def payload(**changes):
    return {"submission_id": "test-submission", "text": "A large pothole in the road",
            "language": "en", "latitude": 0, "longitude": 74.3,
            "landmark_text": "Main road", **changes}


def test_create_and_retrieve(setup):
    client, database = setup
    result = client.post("/api/reports", json=payload())
    assert result.status_code == 201
    response = result.json()
    UUID(response["internal_id"])
    assert response["public_id"].startswith("CV-")
    assert response["priority"] == "HIGH"
    assert response["status"] == "RECEIVED"
    assert response["evidence_confidence"] == pytest.approx(.8)
    assert all(s["signal"] != "_intake_request_v1" for s in response["supporting_signals"])
    assert client.get("/api/reports/" + response["public_id"]).json() == response
    stored = database.rows()[0]
    assert stored["text"] == payload()["text"]
    assert stored["language"] == "en"
    assert stored["ai_summary"] == "Road needs repair"
    assert stored["processing_status"] == "LINKED"
    assert stored["ai_processed_at"]
    assert stored["injection_suspected"] is False
    assert stored["is_civic_issue"] is True
    assert "priority" not in stored and "status" not in stored


def test_restart_and_replay(setup, monkeypatch):
    client, database = setup
    original = client.post("/api/reports", json=payload()).json()
    # Recreate the DB client/repository and app lifespan, retaining only disk storage.
    with TestClient(main.app) as restarted:
        assert restarted.get("/api/reports/" + original["public_id"]).json() == original
        monkeypatch.setattr(ai_intake_service, "call_structured", lambda *args: pytest.fail("AI reran"))
        replay = restarted.post("/api/reports", json=payload())
        assert replay.status_code == 201
        assert replay.json() == {**original, "idempotent_replay": True}
    assert len(database.rows()) == 1


def test_separate_process_reads_persisted_report(setup):
    client, database = setup
    original = client.post("/api/reports", json=payload()).json()
    # A fresh interpreter has no route, repository, or incident state from creation.
    script = '''
import json, sys
sys.path.insert(0, "backend/tests")
from test_reports import DatabaseTransport
from backend.repositories.reports import ReportsRepository
from backend.services.report_adapter import report_response
from backend.repositories.incidents import IncidentsRepository
database = DatabaseTransport(sys.argv[1])
client = database.client()
row = ReportsRepository(client).by_public_id(sys.argv[2])
repository = IncidentsRepository(client)
link = repository.link_for_report(row["id"])
incident = repository.find("incidents", "id", link["incident_id"]) if link else None
print(json.dumps(report_response(row, incident=incident)))
client.postgrest.aclose()
'''
    result = subprocess.run([sys.executable, "-c", script, str(database.path), original["public_id"]],
                            cwd=Path(__file__).resolve().parents[2], capture_output=True,
                            text=True, timeout=20)
    assert result.returncode == 0
    assert json.loads(result.stdout) == original


@pytest.mark.parametrize("changes", [{"text": "Different report"}, {"longitude": 73},
                                     {"image_url": "https://example.invalid/image.jpg"},
                                     {"language": "ur"}, {"landmark_text": "Elsewhere"}])
def test_conflicting_reuse(setup, changes):
    client, database = setup
    client.post("/api/reports", json=payload())
    assert client.post("/api/reports", json=payload(**changes)).status_code == 409
    assert len(database.rows()) == 1


def test_header_key(setup):
    client, database = setup
    headers = {"Idempotency-Key": "header-key"}
    first = client.post("/api/reports", json=payload(), headers=headers).json()
    second = client.post("/api/reports", json=payload(submission_id="another-id"), headers=headers).json()
    assert second == {**first, "idempotent_replay": True}
    assert first["submission_id"] == "test-submission"
    assert database.rows()[0]["submission_id"] == "header-key"


@pytest.mark.parametrize("changes", [{"latitude": 91}, {"longitude": -181}, {"text": "ab"}])
def test_invalid_input(setup, changes):
    client, database = setup
    assert client.post("/api/reports", json=payload(**changes)).status_code == 422
    assert not database.rows()


def test_ai_pending(setup, monkeypatch):
    client, database = setup
    monkeypatch.setattr(ai_intake_service, "call_structured", lambda *args: {
        "status": "pending_fallback", "ai_status": "PENDING"})
    response = client.post("/api/reports", json=payload()).json()
    assert response["ai_status"] == "PENDING"
    assert response["supporting_signals"] == []
    row = database.rows()[0]
    assert row["processing_status"] == "AI_PENDING"
    assert row["ai_summary"] is None and row["ai_processed_at"] is None
    assert row["is_civic_issue"] is None and row["category"] is None
    assert row["ai_error"] == "AI intake unavailable; processing pending"


@pytest.mark.parametrize("claimed,stored", [("Low", "LOW"), ("Medium", "MEDIUM"),
    ("High", "HIGH"), ("Critical", "CRITICAL"), (" high ", "HIGH"),
    ("not specified", None), ("unknown", None), ("", None)])
def test_reported_urgency_matches_database_check(setup, monkeypatch, claimed, stored):
    client, database = setup
    monkeypatch.setattr(ai_intake_service, "call_structured", lambda *args: {
        "status": "success", "data": IntakeExtraction(
            category="SEWERAGE_DRAINAGE", reported_urgency=claimed)})
    result = client.post("/api/reports", json=payload())
    assert result.status_code == 201
    assert database.rows()[0]["reported_urgency"] == stored
    assert database.rows()[0]["ai_status"] == "PROCESSED"
    assert "priority" not in database.rows()[0]
    replay = client.post("/api/reports", json=payload())
    assert replay.json() == {**result.json(), "idempotent_replay": True}


def test_missing_ai_client(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    service = AIIntakeService()
    assert service.call_structured("Report text", IntakeExtraction)["ai_status"] == "PENDING"


def test_ai_exception_is_sanitized(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    service = AIIntakeService()
    class Broken:
        @property
        def chat(self):
            raise RuntimeError("private provider detail")
    service.client = Broken()
    assert service.call_structured("Report text", IntakeExtraction, max_retries=1) == {
        "status": "pending_fallback", "ai_status": "PENDING"}


def test_injection_is_persisted_and_rejected(setup, monkeypatch):
    client, database = setup
    monkeypatch.setattr(ai_intake_service, "call_structured", lambda *args: {
        "status": "success", "data": IntakeExtraction(category="OTHER", injection_suspected=True)})
    assert client.post("/api/reports", json=payload()).status_code == 400
    assert database.rows()[0]["processing_status"] == "REJECTED"
    assert client.post("/api/reports", json=payload()).status_code == 400
    assert len(database.rows()) == 1
    assert not database.rows("incidents")


@pytest.mark.parametrize("mode", ["collision", "race"])
def test_unique_conflict_recovery(setup, mode):
    client, database = setup
    setattr(database, mode, True)
    response = client.post("/api/reports", json=payload())
    assert response.status_code == 201
    assert response.json()["idempotent_replay"] is (mode == "race")
    assert len(database.rows()) == 1


def test_storage_error_is_sanitized(setup):
    client, database = setup
    database.unavailable = True
    response = client.post("/api/reports", json=payload())
    assert response.status_code == 503
    assert response.json() == {"detail": "Report storage unavailable"}


def test_missing_report(setup):
    client, _ = setup
    assert client.get("/api/reports/CV-unknown").status_code == 404


def test_missing_config_fails_at_startup(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SECRET_KEY", raising=False)
    with pytest.raises(RuntimeError, match="Missing required backend environment variables"):
        with TestClient(main.app):
            pass


def test_invalid_config_sanitized(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "invalid-test-url")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "test-only-key")
    with pytest.raises(RuntimeError, match="Unable to initialize backend Supabase client"):
        create_backend_client()
