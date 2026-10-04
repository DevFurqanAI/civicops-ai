"""Real auth dependencies with deterministic Supabase Auth and disk-backed DB."""
from types import SimpleNamespace
from uuid import uuid4
import pytest
from supabase_auth.errors import AuthApiError
from backend import main
from backend.auth import operator_user
from test_reports import setup, payload

CITIZEN = "00000000-0000-0000-0000-000000000002"
OTHER = "00000000-0000-0000-0000-000000000003"
OPERATOR = "00000000-0000-0000-0000-000000000004"
ADMIN = "00000000-0000-0000-0000-000000000005"

def headers(token="citizen"):
    return {"Authorization": "Bearer " + token}

@pytest.fixture
def auth_setup(setup, monkeypatch):
    client, db = setup
    main.app.dependency_overrides.pop(operator_user, None)
    sdk = main.app.state.supabase
    identities = {"citizen": CITIZEN, "other": OTHER, "operator": OPERATOR, "admin": ADMIN}
    for token, identity in identities.items():
        sdk.table("profiles").insert({"id": identity, "role": token.upper() if token in {"operator","admin"} else "CITIZEN"}).execute()
    def verify(token):
        if token not in identities:
            raise AuthApiError("private auth provider error", 401, "bad_jwt")
        return SimpleNamespace(user=SimpleNamespace(id=identities[token], is_anonymous=False,
            user_metadata={"role": "ADMIN"}))
    monkeypatch.setattr(sdk.auth, "get_user", verify)
    return client, db, sdk

@pytest.mark.parametrize("path,body", [
    ("/api/incidents",None), ("/api/dashboard/summary",None), ("/api/auth/me",None),
    ("/api/incidents/unknown/status",{"status":"VERIFIED"}),
    ("/api/incidents/unknown/assign",{"department":"WATER_SUPPLY"}),
    ("/api/incidents/unknown/response-plan",{"action":"APPROVE"}),
    ("/api/incidents/unknown/notes",{"notes":"note"}),
])
def test_missing_token_rejected(auth_setup,path,body):
    client,_,_ = auth_setup
    response = client.get(path) if body is None else client.post(path,json=body)
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"

@pytest.mark.parametrize("token", ["invalid", "expired"])
def test_invalid_and_expired_token_rejected_safely(auth_setup,token):
    client,_,_ = auth_setup
    response = client.get("/api/auth/me",headers=headers(token))
    assert response.status_code == 401
    assert "private" not in response.text

def test_malformed_token_does_not_downgrade_to_public(auth_setup):
    client,db,_ = auth_setup
    response = client.post("/api/reports",json=payload(),headers={"Authorization":"Basic invalid"})
    assert response.status_code == 401
    assert db.rows() == []

def test_missing_profile_fails_closed(auth_setup,monkeypatch):
    client,_,sdk = auth_setup
    monkeypatch.setattr(sdk.auth,"get_user",lambda token: SimpleNamespace(user=SimpleNamespace(id=str(uuid4()),is_anonymous=False)))
    assert client.get("/api/auth/me",headers=headers()).status_code == 403

@pytest.mark.parametrize("path,body", [
    ("/api/incidents",None), ("/api/dashboard/summary",None),
    ("/api/incidents/unknown/status",{"status":"VERIFIED"}),
    ("/api/incidents/unknown/assign",{"department":"WATER_SUPPLY"}),
    ("/api/incidents/unknown/response-plan",{"action":"APPROVE"}),
    ("/api/incidents/unknown/notes",{"notes":"note"}),
])
def test_citizen_cannot_use_operator_routes_even_with_admin_metadata(auth_setup,path,body):
    client,_,_ = auth_setup
    response = client.get(path,headers=headers()) if body is None else client.post(path,json=body,headers=headers())
    assert response.status_code == 403
    assert client.get("/api/auth/me",headers=headers()).json()["role"] == "CITIZEN"

@pytest.mark.parametrize("role", ["operator", "admin"])
def test_trusted_operator_roles_can_read(auth_setup,role):
    client,_,_ = auth_setup
    assert client.get("/api/incidents",headers=headers(role)).status_code == 200
    assert client.get("/api/dashboard/summary",headers=headers(role)).status_code == 200

def test_owner_scopes_and_tracking_access(auth_setup):
    client,db,_ = auth_setup
    first = client.post("/api/reports",json=payload(),headers=headers()).json()
    replay = client.post("/api/reports",json=payload(),headers=headers()).json()
    second = client.post("/api/reports",json=payload(),headers=headers("other")).json()
    assert replay["idempotent_replay"] and replay["public_id"] == first["public_id"]
    assert second["public_id"] != first["public_id"]
    row = next(r for r in db.rows() if r["id"] == first["internal_id"])
    assert row["reporter_id"] == CITIZEN and row["idempotency_scope"] == "USER:" + CITIZEN
    path = "/api/reports/" + first["public_id"]
    assert client.get(path).status_code == 404
    assert client.get(path,headers=headers("other")).status_code == 404
    assert client.get(path,headers=headers()).status_code == 200
    assert client.get(path,headers=headers("operator")).status_code == 200
    assert client.get(path + "/tracking",headers=headers("other")).status_code == 404

def test_public_history_redacts_private_notes_and_actor_ids(auth_setup):
    client,db,sdk = auth_setup
    report = client.post("/api/reports",json=payload()).json()
    sdk.table("incident_status_history").insert({"id":str(uuid4()),"incident_id":report["incident_id"],
        "old_status":"RECEIVED","new_status":"VERIFIED","notes":"private operator notes", "changed_by":OPERATOR}).execute()
    tracking = client.get("/api/reports/" + report["public_id"] + "/tracking").json()
    assert len(tracking["history"]) == 2
    assert all(set(entry) == {"old_status","new_status","created_at"} for entry in tracking["history"])
    assert OPERATOR not in str(tracking) and "private operator notes" not in str(tracking)
    assert tracking["can_submit_feedback"] is False
    assert db.rows()[0]["reporter_id"] is None

def test_operator_note_is_persistent_and_audited(auth_setup):
    client,db,_ = auth_setup
    report = client.post("/api/reports",json=payload()).json()
    response = client.post("/api/incidents/" + report["incident_id"] + "/notes",headers=headers("operator"),json={"notes":"Inspection scheduled"})
    assert response.status_code == 200
    saved = next(r for r in db.rows("audit_logs") if r["action"] == "OPERATIONAL_NOTE_ADDED")
    assert saved["actor_id"] == OPERATOR and saved["actor_type"] == "OPERATOR"
    assert saved["details"]["notes"] == "Inspection scheduled"
    assert "Inspection scheduled" not in client.get("/api/reports/" + report["public_id"] + "/tracking").text

def test_invalid_status_jump_rejected_without_write(auth_setup):
    client,db,_ = auth_setup
    report = client.post("/api/reports",json=payload()).json()
    count = len(db.rows("audit_logs"))
    response = client.post("/api/incidents/" + report["incident_id"] + "/status",headers=headers("operator"),json={"status":"RESOLVED"})
    assert response.status_code == 409
    assert db.rows("incidents")[0]["status"] == "RECEIVED"
    assert len(db.rows("audit_logs")) == count

def test_valid_operator_mutations_and_history_persist(auth_setup):
    client,db,_ = auth_setup
    report = client.post("/api/reports",json=payload()).json()
    prefix = "/api/incidents/" + report["incident_id"]
    assert client.post(prefix+"/status",headers=headers("operator"),json={"status":"VERIFIED","notes":"private verification note"}).status_code == 200
    for department in ["ROAD_MAINTENANCE","WATER_SUPPLY"]:
        assert client.post(prefix+"/assign",headers=headers("operator"),json={"department":department}).status_code == 200
    assignments = db.rows("incident_assignments")
    assert len(assignments) == 2
    assert sum(row.get("completed_at") is None for row in assignments) == 1
    closed = next(row for row in assignments if row.get("completed_at"))
    active = next(row for row in assignments if row.get("completed_at") is None)
    assert closed["completed_at"] == active["assigned_at"]
    assert all(row["assigned_by"] == OPERATOR for row in assignments)
    history = db.rows("incident_status_history")
    assert len(history) == 2
    changed = next(row for row in history if row["new_status"] == "VERIFIED")
    assert changed["old_status"] == "RECEIVED" and changed["changed_by"] == OPERATOR
    from test_reports import DatabaseTransport
    fresh = DatabaseTransport(db.path)
    assert fresh.rows("incident_assignments") == assignments
    assert fresh.rows("incident_status_history") == history
    assert client.post(prefix+"/response-plan",headers=headers("operator"),json={"action":"APPROVE"}).status_code == 200
    assert db.rows("incidents")[0]["response_plan_approved_by"] == OPERATOR
    assert client.post(prefix+"/response-plan",headers=headers("operator"),json={"action":"MODIFY","response_plan":["Inspect then repair"]}).status_code == 200
    assert db.rows("incidents")[0]["response_plan_status"] == "MODIFIED"
    assert db.rows("incidents")[0]["response_plan_approved_by"] is None
    actions = {row["action"] for row in db.rows("audit_logs")}
    assert {"INCIDENT_STATUS_CHANGED","INCIDENT_DEPARTMENT_ASSIGNED","RESPONSE_PLAN_APPROVE","RESPONSE_PLAN_MODIFY"} <= actions


def test_feedback_ownership_link_and_duplicate_checks(auth_setup):
    client,db,sdk = auth_setup
    report = client.post("/api/reports",json=payload(),headers=headers()).json()
    body = {"public_id":report["public_id"],"incident_id":report["incident_id"],"response":"NO"}
    assert client.post("/api/feedback",json=body).status_code == 401
    assert client.post("/api/feedback",json=body,headers=headers("other")).status_code == 403
    assert client.post("/api/feedback",json={**body,"incident_id":str(uuid4())},headers=headers()).status_code == 403
    assert client.post("/api/feedback",json=body,headers=headers()).status_code == 409
    sdk.table("incidents").update({"status":"RESOLVED"}).eq("id",report["incident_id"]).execute()
    assert client.get("/api/reports/" + report["public_id"] + "/tracking",headers=headers()).json()["can_submit_feedback"]
    result = client.post("/api/feedback",json=body,headers=headers())
    assert result.status_code == 201 and result.json()["review_requested"]
    assert len(db.rows("resolution_feedback")) == 1
    assert db.rows("resolution_feedback")[0]["user_id"] == CITIZEN
    assert any(row["action"] == "RESOLUTION_FEEDBACK_REVIEW_REQUESTED" for row in db.rows("audit_logs"))
    assert client.post("/api/feedback",json=body,headers=headers()).status_code == 409
    assert db.rows("incidents")[0]["status"] == "RESOLVED"

def test_cors_is_explicit_and_no_hardcoded_login(auth_setup):
    client,_,_ = auth_setup
    response = client.options("/api/auth/me",headers={"Origin":"http://localhost:5173","Access-Control-Request-Method":"GET","Access-Control-Request-Headers":"Authorization"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "access-control-allow-credentials" not in response.headers
    response = client.get("/health",headers={"Origin":"https://untrusted.invalid"})
    assert "access-control-allow-origin" not in response.headers
    assert client.post("/api/auth/login",json={"username":"admin","password":"anything"}).status_code == 404


def test_stale_operator_edit_and_audit_failure_roll_back(auth_setup):
    client,db,_ = auth_setup
    report = client.post("/api/reports",json=payload()).json()
    prefix = "/api/incidents/" + report["incident_id"]
    old = client.get(prefix,headers=headers("operator")).json()["updated_at"]
    assert client.post(prefix+"/assign",headers=headers("operator"),json={"department":"WATER_SUPPLY"}).status_code == 200
    assert client.post(prefix+"/status",headers=headers("operator"),json={"status":"VERIFIED","expected_updated_at":old}).status_code == 409
    before = db.rows("incidents")
    before_history = db.rows("incident_status_history")
    db.fail_insert_table = "audit_logs"
    assert client.post(prefix+"/status",headers=headers("operator"),json={"status":"VERIFIED"}).status_code == 503
    assert db.rows("incidents") == before and db.rows("incident_status_history") == before_history
