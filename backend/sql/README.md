# Stage 4 transaction functions

Department Portal implementation supersedes the functions below. Apply
[department_portal.sql](department_portal.sql) once using the
[activation guide](../../docs/DEPARTMENT_PORTAL.md). Its live application is pending.
Do not reapply the historical Stage 4 script after the department migration.

Run the **entire exact script** in [`stage4_operations.sql`](stage4_operations.sql)
in Supabase Dashboard > SQL Editor as the database owner. It is a single
BEGIN/COMMIT transaction and can be rerun before integration. It creates only
four functions and their EXECUTE grants; no table, column, RLS policy, signup
trigger or profile role is changed. Application has been confirmed by the user. FastAPI now calls all four RPCs;
there is no non-atomic fallback.

## Authorization assumptions

FastAPI verifies each Bearer access token using Supabase Auth `get_user(token)`.
It loads `profiles.role`, never JWT user metadata or a frontend role. The server
supplies the verified user's UUID as `p_actor_id`; it is never accepted from an
HTTP request body. Browser publishable credentials cannot execute these RPCs:
EXECUTE is revoked from PUBLIC, anon and authenticated, and granted only to
service_role. Functions use SECURITY INVOKER with an empty search_path.

Each function rechecks the profile role under a shared row lock and locks its
incident FOR UPDATE. Operator functions require OPERATOR or ADMIN. Feedback
requires CITIZEN and ownership of the report linked to the incident. Existing
RLS remains enabled; the server-only secret client provides service_role access.
The existing trigger forces all new profiles to CITIZEN, and existing profile
policies prevent citizens changing role/is_verified. Those protections remain.

## Functions and exact parameters

| Function | Parameters (in order) | Tables modified | Return JSON |
| --- | --- | --- | --- |
| `civicops_change_incident_status` | `p_incident_id uuid`, `p_actor_id uuid`, `p_expected_updated_at timestamptz`, `p_new_status text`, `p_notes text = NULL` | incidents, incident_status_history, audit_logs | incident_id, status, updated_at |
| `civicops_assign_incident_department` | `p_incident_id uuid`, `p_actor_id uuid`, `p_expected_updated_at timestamptz`, `p_department_id uuid`, `p_notes text = NULL` | incidents, incident_assignments, audit_logs | incident_id, department_id, assignment_id, updated_at |
| `civicops_review_incident_response_plan` | `p_incident_id uuid`, `p_actor_id uuid`, `p_expected_updated_at timestamptz`, `p_action text`, `p_response_plan jsonb = NULL`, `p_notes text = NULL` | incidents, audit_logs | incident_id, response_plan, response_plan_status, updated_at |
| `civicops_submit_resolution_feedback` | `p_report_id uuid`, `p_incident_id uuid`, `p_actor_id uuid`, `p_response text`, `p_comment text = NULL` | resolution_feedback, audit_logs | feedback_id, response, review_requested |

`p_expected_updated_at` must be the server's last-read incident version. A stale
version fails with PT409 rather than overwriting a concurrent operation. History
and audit inserts occur inside the same transaction as the incident change; any
error rolls back everything. There is no non-atomic fallback.

## Rules

- Transitions are defined centrally in `backend/services/operations.py`. The SQL
  block is generated from that policy; tests reject divergence. Regenerate with
  `python -m backend.sql.render_status_policy` after a policy change.
- Normal flow: RECEIVED > VERIFIED > ASSIGNED > IN_PROGRESS > RESOLVED.
- NEEDS_REVIEW may go to VERIFIED or REJECTED; rejection requires notes.
- RESOLVED may go to REOPENED; REOPENED may go to ASSIGNED/IN_PROGRESS/NEEDS_REVIEW.
- No RECEIVED > RESOLVED jump. ASSIGNED requires a department. IN_PROGRESS
  requires a human-approved response plan.
- Assignment uses an active seeded department, appends assignment history and
  changes current_department_id. Before inserting the new assignment, it closes
  all prior active assignments for that incident with completed_at set to the
  same timestamp as the new assigned_at. Completed history remains unchanged.
  It does not implicitly change incident status or delete previous assignments.
  Closed incidents cannot be assigned.
- Plan actions are APPROVE, MODIFY and REJECT. MODIFY writes MODIFIED and clears
  approval identity/time; it needs a separate human approval. APPROVE accepts a
  nonempty PENDING/MODIFIED plan and records approver/time. REJECT clears approval.
  Closed incidents cannot have plan reviews. Each action writes an audit record.
  JSON step validation uses the explicit elem(value) column alias for type,
  trimmed-text and length checks.
- Feedback accepts YES/PARTIALLY/NO only for an owned, linked report whose incident
  is currently RESOLVED. Existing UNIQUE(report_id, incident_id) rejects duplicates.
  NO and PARTIALLY record review_requested in the audit event. Neither changes
  incident status. This is a review flag, not an automated review worker.
- Operator notes currently use one atomic audit_logs insert through an authorized
  FastAPI endpoint. They are private and not exposed through public tracking.

## Error codes and verification

PT403: forbidden; PT404: incident missing/archived; PT409: stale version or
invalid transition/closed state; PT422: invalid action/notes/plan/department;
23505: existing feedback unique constraint. Raw database errors must not reach
public HTTP responses or logs.

The user applied the script successfully. Live verification through FastAPI and
real Supabase Auth/PostgreSQL passed 35 checks, including status history,
assignment completion, plan reviews, stale-version rejection, feedback ownership,
duplicate rejection and server-only RPC access. Disposable records/accounts were
removed afterward. This was an in-process FastAPI check, not browser automation.
Deterministic tests also cover rollback on an injected audit failure.

Run the opt-in verifier with `backend/.venv/Scripts/python.exe backend/tests/live_stage4.py`.
It creates isolated disposable accounts and records, uses credentials only in
memory, and cleans up its own records. It is not part of automatic pytest runs.
