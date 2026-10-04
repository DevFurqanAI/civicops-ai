"""Department workflow through real routes and the disk-backed RPC transport."""
from types import SimpleNamespace
from uuid import uuid4
import pytest
from backend.auth import CurrentUser
from backend.repositories.incidents import stable_id, IncidentsRepository
from backend.services.operations import perform
from fastapi import HTTPException
from test_auth import auth_setup, headers
from test_reports import setup, payload
from test_media import image_bytes

A = "00000000-0000-0000-0000-000000000011"
B = "00000000-0000-0000-0000-000000000012"
DA = stable_id("department", "WATER_SUPPLY")
DB = stable_id("department", "ROAD_MAINTENANCE")
WASA = "00000000-0000-0000-0000-000000000013"
DW = stable_id("department", "WATER_SANITATION")

@pytest.fixture
def department_setup(auth_setup, monkeypatch):
    client, db, sdk = auth_setup
    for identity, dept in [(A, DA), (B, DB), (WASA, DW)]:
        sdk.table("profiles").insert({"id": identity, "role": "DEPARTMENT", "department_id": dept}).execute()
    original = sdk.auth.get_user
    def verify(token):
        if token in {"dept-a", "dept-b", "wasa"}:
            return SimpleNamespace(user=SimpleNamespace(id={"dept-a": A, "dept-b": B, "wasa": WASA}[token],
                is_anonymous=False, user_metadata={"role": "ADMIN", "department_id": DB}))
        return original(token)
    monkeypatch.setattr(sdk.auth, "get_user", verify)
    objects = {}
    class Bucket:
        def upload(self, path, data, options):
            objects[path] = data
        def download(self, path):
            return objects[path]
    monkeypatch.setattr(sdk.storage, "get_bucket", lambda name: SimpleNamespace(public=False))
    monkeypatch.setattr(sdk.storage, "from_", lambda name: Bucket())
    return client, db, sdk

def release(env, department="WATER_SUPPLY", **fields):
    client, _, _ = env
    report = client.post("/api/reports", headers=headers(), json=payload(submission_id=str(uuid4()), **fields)).json()
    op = "/api/incidents/" + report["incident_id"]
    assert client.post(op + "/status", headers=headers("operator"), json={"status": "VERIFIED"}).status_code == 200
    assert client.post(op + "/assign", headers=headers("operator"), json={"department": department}).status_code == 200
    assert client.post(op + "/status", headers=headers("operator"), json={"status": "ASSIGNED"}).status_code == 200
    return report, op, "/api/department/incidents/" + report["incident_id"]

def progress(env, op, dep):
    client, _, _ = env
    assert client.post(dep + "/status", headers=headers("dept-a"), json={"status": "ACCEPTED"}).status_code == 200
    assert client.post(dep + "/status", headers=headers("dept-a"), json={"status": "IN_PROGRESS"}).status_code == 409
    assert client.post(op + "/response-plan", headers=headers("operator"), json={"action": "APPROVE"}).status_code == 200
    assert client.post(dep + "/status", headers=headers("dept-a"), json={"status": "IN_PROGRESS"}).status_code == 200
    assert client.post(dep + "/status", headers=headers("dept-a"), json={"status": "RESOLVED_PENDING_VERIFICATION"}).status_code == 422
    assert client.post(dep + "/status", headers=headers("dept-a"), json={"status": "RESOLVED_PENDING_VERIFICATION", "notes": "Drain repaired; inspected site."}).status_code == 200

def test_department_identity_and_queue_isolation(department_setup):
    client, _, _ = department_setup
    report, op, dep = release(department_setup)
    assert client.get("/api/auth/me", headers=headers("dept-a")).json() == {"user_id": A, "role": "DEPARTMENT", "department_id": DA}
    assert [r["incident_id"] for r in client.get("/api/department/incidents", headers=headers("dept-a")).json()] == [report["incident_id"]]
    assert client.get("/api/department/incidents", headers=headers("dept-b")).json() == []
    for suffix in ["", "/actions", "/history", "/updates"]:
        assert client.get(dep + suffix, headers=headers("dept-b")).status_code == 404
    for path in ["/api/incidents", "/api/dashboard/summary", op]:
        assert client.get(path, headers=headers("dept-a")).status_code == 403

@pytest.mark.parametrize("token", ["citizen", "other", "operator", "admin"])
def test_non_department_cannot_use_department_actions(department_setup, token):
    client, _, _ = department_setup
    _, _, dep = release(department_setup)
    assert client.get("/api/department/incidents", headers=headers(token)).status_code == 403
    assert client.post(dep + "/status", headers=headers(token), json={"status": "ACCEPTED"}).status_code == 403
    assert client.post(dep + "/updates", headers=headers(token), json={"notes": "Forged update"}).status_code == 403

@pytest.mark.parametrize("suffix,body", [
    ("/status", {"status": "RESOLVED"}), ("/status", {"status": "REOPENED"}),
    ("/assign", {"department": "ROAD_MAINTENANCE"}), ("/response-plan", {"action": "APPROVE"}),
    ("/response-plan", {"action": "MODIFY", "response_plan": ["Fake plan"]}),
    ("/response-plan", {"action": "REJECT"}), ("/notes", {"notes": "Fake operator note"}),
])
def test_department_cannot_use_operator_mutations(department_setup, suffix, body):
    client, _, _ = department_setup
    _, op, _ = release(department_setup)
    assert client.post(op + suffix, headers=headers("dept-a"), json=body).status_code == 403

def test_forged_membership_and_inactive_membership_fail(department_setup):
    client, _, sdk = department_setup
    _, _, dep = release(department_setup)
    assert client.post(dep + "/status", headers=headers("dept-b"), json={"status": "ACCEPTED", "department_id": DA, "role": "ADMIN"}).status_code == 404
    sdk.table("profiles").update({"department_id": None}).eq("id", A).execute()
    assert client.get("/api/auth/me", headers=headers("dept-a")).status_code == 403
    sdk.table("profiles").update({"department_id": DA}).eq("id", A).execute()
    sdk.table("departments").update({"is_active": False}).eq("id", DA).execute()
    assert client.get("/api/department/incidents", headers=headers("dept-a")).status_code == 403

def test_department_lifecycle_operator_verification_and_feedback(department_setup):
    client, db, _ = department_setup
    report, op, dep = release(department_setup)
    progress(department_setup, op, dep)
    assert db.rows("incidents")[0]["status"] == "RESOLVED_PENDING_VERIFICATION"
    assert not db.rows("incidents")[0].get("resolved_at")
    body = {"public_id": report["public_id"], "incident_id": report["incident_id"], "response": "YES"}
    tracking = "/api/reports/" + report["public_id"] + "/tracking"
    assert not client.get(tracking, headers=headers()).json()["can_submit_feedback"]
    assert client.post("/api/feedback", headers=headers(), json=body).status_code == 409
    assert client.post(dep + "/status", headers=headers("dept-a"), json={"status": "RESOLVED"}).status_code == 409
    assert client.post(op + "/status", headers=headers("operator"), json={"status": "RESOLVED"}).status_code == 200
    assert client.get(tracking, headers=headers()).json()["can_submit_feedback"]
    assert client.post("/api/feedback", headers=headers(), json=body).status_code == 201
    assert client.post("/api/feedback", headers=headers(), json=body).status_code == 409
    assert db.rows("incidents")[0]["resolved_at"]
    status_history = client.get(tracking, headers=headers()).json()["history"]
    assert [r["new_status"] for r in status_history] == ["RECEIVED", "VERIFIED", "ASSIGNED", "ACCEPTED", "IN_PROGRESS", "RESOLVED_PENDING_VERIFICATION", "RESOLVED"]
    events = [r for r in db.rows("audit_logs") if r.get("actor_id") == A]
    assert len(events) == 3 and all(r["actor_type"] == "USER" and r["details"]["department_id"] == DA for r in events)
    assert "Drain repaired" not in str(client.get(tracking, headers=headers()).json())

def test_rejection_requires_note_and_reassignment_revokes_authority(department_setup):
    client, db, _ = department_setup
    _, op, dep = release(department_setup)
    progress(department_setup, op, dep)
    assert client.post(op + "/status", headers=headers("operator"), json={"status": "REOPENED"}).status_code == 422
    assert client.post(op + "/status", headers=headers("operator"), json={"status": "REOPENED", "notes": "Repair incomplete"}).status_code == 200
    assert client.post(dep + "/status", headers=headers("dept-a"), json={"status": "ACCEPTED"}).status_code == 404
    assert client.post(op + "/assign", headers=headers("operator"), json={"department": "ROAD_MAINTENANCE"}).status_code == 200
    assert db.rows("incidents")[0]["status"] == "ASSIGNED"
    assert sum(r.get("completed_at") is None for r in db.rows("incident_assignments")) == 1
    assert client.get(dep, headers=headers("dept-a")).status_code == 404
    assert client.post(dep + "/updates", headers=headers("dept-a"), json={"notes": "Old team"}).status_code == 404
    assert client.post(dep + "/status", headers=headers("dept-b"), json={"status": "ACCEPTED"}).status_code == 200

def test_work_update_stale_version_and_audit_rollback(department_setup):
    client, db, _ = department_setup
    _, op, dep = release(department_setup)
    version = client.get(dep, headers=headers("dept-a")).json()["updated_at"]
    assert client.post(dep + "/updates", headers=headers("dept-a"), json={"notes": "Crew arrived", "expected_updated_at": version}).status_code == 200
    assert client.post(dep + "/status", headers=headers("dept-a"), json={"status": "ACCEPTED", "expected_updated_at": version}).status_code == 409
    assert client.post(dep + "/updates", headers=headers("dept-a"), json={"notes": "Stale", "expected_updated_at": version}).status_code == 409
    assert client.get(dep + "/updates", headers=headers("dept-a")).json()[0]["notes"] == "Crew arrived"
    assert client.get(op + "/work-history", headers=headers("operator")).json()[0]["notes"] == "Crew arrived"
    before, history = db.rows("incidents"), db.rows("incident_status_history")
    db.fail_insert_table = "audit_logs"
    assert client.post(dep + "/status", headers=headers("dept-a"), json={"status": "ACCEPTED"}).status_code == 503
    assert db.rows("incidents") == before and db.rows("incident_status_history") == history
    assert client.post(dep + "/updates", headers=headers("dept-a"), json={"notes": "Failed update"}).status_code == 503
    assert db.rows("incidents") == before

def test_rpc_rechecks_membership_after_backend_read(department_setup):
    _, _, sdk = department_setup
    report, _, _ = release(department_setup)
    repository = IncidentsRepository(sdk)
    incident = repository.resolve(report["incident_id"])
    sdk.table("profiles").update({"department_id": DB}).eq("id", A).execute()
    with pytest.raises(HTTPException) as error:
        perform(repository, incident, CurrentUser(A, "DEPARTMENT", DA), "STATUS", {"status": "ACCEPTED"})
    assert error.value.status_code == 403

def test_department_updates_never_disclose_operator_notes(department_setup):
    client, _, sdk = department_setup
    report, _, dep = release(department_setup)
    sdk.table("audit_logs").insert({"id": str(uuid4()), "incident_id": report["incident_id"],
        "actor_type": "OPERATOR", "action": "INCIDENT_STATUS_CHANGED",
        "details": {"role": "OPERATOR", "department_id": DA, "notes": "Private operator context"}}).execute()
    sdk.table("audit_logs").insert({"id": str(uuid4()), "incident_id": report["incident_id"],
        "actor_type": "SYSTEM", "action": "OTHER_EVENT", "details": None}).execute()
    assert client.get(dep + "/updates", headers=headers("dept-a")).json() == []

def test_department_evidence_access_is_scoped_and_revoked(department_setup):
    client, _, _ = department_setup
    report, op, dep = release(department_setup)
    path = "/api/reports/" + report["public_id"] + "/media"
    image = client.post(path, params={"upload_id": str(uuid4()), "filename": "photo.png"},
        headers={**headers(), "Content-Type": "image/png"}, content=image_bytes()).json()
    item = path + "/" + image["media_id"]
    assert client.get(op + "/media", headers=headers("dept-a")).status_code == 200
    assert client.get(item, headers=headers("dept-a")).status_code == 200
    assert client.get(op + "/media", headers=headers("dept-b")).status_code == 404
    assert client.get(item, headers=headers("dept-b")).status_code == 404
    assert client.post(path, params={"upload_id": str(uuid4()), "filename": "photo.png"}, headers={**headers("dept-a"), "Content-Type": "image/png"}, content=image_bytes()).status_code == 404
    assert client.post(op + "/assign", headers=headers("operator"), json={"department": "ROAD_MAINTENANCE"}).status_code == 200
    assert client.get(item, headers=headers("dept-a")).status_code == 404
    assert client.get(item, headers=headers("dept-b")).status_code == 200

def test_departments_have_separate_queues_and_routed_intake_is_not_released(department_setup):
    client, _, _ = department_setup
    intake = client.post("/api/reports", json=payload(submission_id=str(uuid4())), headers=headers()).json()
    assert client.get("/api/department/incidents", headers=headers("dept-a")).json() == []
    assert client.get("/api/department/incidents/" + intake["incident_id"], headers=headers("dept-a")).status_code == 404
    # Release that intake explicitly, then create a geographically unrelated incident.
    op = "/api/incidents/" + intake["incident_id"]
    assert client.post(op + "/status", headers=headers("operator"), json={"status": "VERIFIED"}).status_code == 200
    assert client.post(op + "/assign", headers=headers("operator"), json={"department": "WATER_SUPPLY"}).status_code == 200
    assert client.post(op + "/status", headers=headers("operator"), json={"status": "ASSIGNED"}).status_code == 200
    other, _, _ = release(department_setup, "ROAD_MAINTENANCE", latitude=-40, longitude=-100)
    assert other["incident_id"] != intake["incident_id"]
    assert [r["incident_id"] for r in client.get("/api/department/incidents", headers=headers("dept-a")).json()] == [intake["incident_id"]]
    assert [r["incident_id"] for r in client.get("/api/department/incidents", headers=headers("dept-b")).json()] == [other["incident_id"]]

@pytest.mark.parametrize("status", ["ACCEPTED", "IN_PROGRESS", "RESOLVED_PENDING_VERIFICATION"])
def test_reassignment_resets_work_and_requires_fresh_acceptance(department_setup, status):
    client, db, sdk = department_setup
    _, op, dep = release(department_setup)
    sdk.table("incidents").update({"status": status}).eq("id", db.rows("incidents")[0]["id"]).execute()
    assert client.post(op + "/assign", headers=headers("operator"), json={"department": "ROAD_MAINTENANCE"}).status_code == 200
    assert db.rows("incidents")[0]["status"] == "ASSIGNED"
    assert client.get(dep, headers=headers("dept-a")).status_code == 404
    assert client.post(dep + "/status", headers=headers("dept-b"), json={"status": "IN_PROGRESS"}).status_code == 409
    assert client.post(dep + "/status", headers=headers("dept-b"), json={"status": "ACCEPTED"}).status_code == 200

def test_operator_and_admin_cannot_skip_department_completion(department_setup):
    client, _, _ = department_setup
    _, op, dep = release(department_setup)
    for token in ["operator", "admin"]:
        assert client.post(op + "/status", headers=headers(token), json={"status": "ACCEPTED"}).status_code == 409
        assert client.post(op + "/status", headers=headers(token), json={"status": "IN_PROGRESS"}).status_code == 409
    progress(department_setup, op, dep)
    assert client.post(op + "/status", headers=headers("admin"), json={"status": "RESOLVED"}).status_code == 200

def test_new_active_states_keep_fusion_without_overwriting_work(department_setup):
    client, db, sdk = department_setup
    first, _, _ = release(department_setup, landmark_text="Beacon school gate 2")
    identity = first["incident_id"]
    for status in ["ACCEPTED", "RESOLVED_PENDING_VERIFICATION"]:
        sdk.table("incidents").update({"status": status}).eq("id", identity).execute()
        second = client.post("/api/reports", headers=headers(), json=payload(submission_id=str(uuid4()), landmark_text="Beacon school gate 2")).json()
        assert second["incident_id"] == identity and second["status"] == status
    assert len(db.rows("incident_reports")) == 3

@pytest.mark.parametrize("coordinates", [{"latitude": 31.5, "longitude": 74.3}, {"latitude": None, "longitude": None}])
def test_verified_atomic_release_water_sanitation_queue_acceptance_and_refresh(department_setup, coordinates, monkeypatch):
    from fastapi.testclient import TestClient
    from backend import main
    client, db, sdk = department_setup
    report = client.post("/api/reports", headers=headers(), json=payload(**coordinates)).json()
    op = "/api/incidents/" + report["incident_id"]
    dep = "/api/department/incidents/" + report["incident_id"]
    body = {"department": "WATER_SANITATION", "release": True}
    assert client.post(op + "/assign", headers=headers("operator"), json=body).status_code == 409
    assert db.rows("incident_assignments") == []
    assert client.post(op + "/status", headers=headers("operator"), json={"status": "VERIFIED"}).status_code == 200
    version = client.get(op, headers=headers("operator")).json()["updated_at"]
    assert client.post(op + "/assign", headers=headers("operator"), json={**body, "expected_updated_at": version}).status_code == 200
    queue = client.get("/api/department/incidents", headers=headers("wasa")).json()
    assert [r["incident_id"] for r in queue] == [report["incident_id"]]
    assert queue[0]["status"] == "ASSIGNED"
    assert queue[0]["location"]["latitude"] == coordinates["latitude"]
    assert queue[0]["location"]["longitude"] == coordinates["longitude"]
    assert client.get("/api/department/incidents", headers=headers("dept-b")).json() == []
    assert client.get(dep, headers=headers("dept-b")).status_code == 404
    assert client.post(dep + "/status", headers=headers("wasa"), json={"status": "ACCEPTED"}).status_code == 200
    # New SDK instance on app restart; keep only the deterministic Auth verifier
    # and the on-disk database, rather than the old client or an in-memory store.
    verifier = sdk.auth.get_user
    def fresh_client():
        replacement = db.client()
        monkeypatch.setattr(replacement.auth, "get_user", verifier)
        return replacement
    monkeypatch.setattr(main, "create_backend_client", fresh_client)
    with TestClient(main.app) as refreshed:
        assert refreshed.get(dep, headers=headers("wasa")).json()["status"] == "ACCEPTED"
        assert len(refreshed.get("/api/department/incidents", headers=headers("wasa")).json()) == 1
        assert [r["new_status"] for r in refreshed.get(dep + "/history", headers=headers("wasa")).json()] == ["RECEIVED", "VERIFIED", "ASSIGNED", "ACCEPTED"]
    assert sum(r.get("completed_at") is None for r in db.rows("incident_assignments")) == 1


def test_atomic_release_stale_rollback_and_reassignment(department_setup):
    client, db, sdk = department_setup
    _, op, dep = release(department_setup)
    version = client.get(op, headers=headers("operator")).json()["updated_at"]
    body = {"department": "WATER_SANITATION", "release": True, "expected_updated_at": version}
    before = {table: db.rows(table) for table in ["incidents", "incident_assignments", "incident_status_history", "audit_logs"]}
    db.fail_insert_table = "audit_logs"
    assert client.post(op + "/assign", headers=headers("operator"), json=body).status_code == 503
    assert all(db.rows(table) == rows for table, rows in before.items())
    db.fail_insert_table = None
    assert client.post(op + "/assign", headers=headers("operator"), json=body).status_code == 200
    assert client.post(op + "/assign", headers=headers("operator"), json=body).status_code == 409
    assert client.get(dep, headers=headers("dept-a")).status_code == 404
    assert client.get(dep, headers=headers("wasa")).status_code == 200
    active = [r for r in db.rows("incident_assignments") if r.get("completed_at") is None]
    assert len(active) == 1 and active[0]["department_id"] == DW
    sdk.table("incident_assignments").update({"completed_at": "2026-10-04T15:00:00Z"}).eq("id", active[0]["id"]).execute()
    assert client.get("/api/department/incidents", headers=headers("wasa")).json() == []
    assert client.get(dep, headers=headers("wasa")).status_code == 404


def test_manual_location_survives_department_release_and_has_no_coordinates(department_setup):
    client, _, _ = department_setup
    report, op, dep = release(department_setup, landmark_text="Near Nishtar Hospital, Multan", latitude=None, longitude=None)
    expected = {"landmark": "Near Nishtar Hospital, Multan", "latitude": None, "longitude": None}
    assert client.get(op, headers=headers("operator")).json()["location"] == expected
    assert client.get(dep, headers=headers("dept-a")).json()["location"] == expected
    assert client.get("/api/reports/" + report["public_id"] + "/tracking", headers=headers()).json()["location"] == expected
