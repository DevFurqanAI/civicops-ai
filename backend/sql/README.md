# CivicOps AI SQL and RPCs

These scripts extend the existing Supabase schema; they are not a complete database bootstrap. Base tables, department seeds, RLS and the Auth → CITIZEN profile trigger must already exist. There is no repository migration ledger proving what any live environment has applied.

## Apply only the applicable script

| Script | Applicability |
| --- | --- |
| [department_portal.sql](department_portal.sql) | One-time department schema/RPC migration against the verified pre-department base schema |
| [department_assignment_release.sql](department_assignment_release.sql) | Repeatable RPC-only patch for an older department installation missing Assign & Release |
| [stage4_operations.sql](stage4_operations.sql) | Historical pre-department RPCs; do not apply to the current system |

For an existing current environment, first inspect installed columns/functions; **do not rerun department_portal.sql**. It adds explicit constraints/index/trigger and is not repeatable. The latest full migration already includes the Assign & Release wrapper, so its separate patch is unnecessary there. Never apply historical Stage 4 after the department migration: it restores obsolete actor/lifecycle behavior.

For a new compatible base database, execute the entire current department_portal.sql in Supabase Dashboard → SQL Editor as owner. BEGIN/COMMIT makes schema/function installation atomic. Verify grants, profile trigger, role/status checks and RPC behavior afterward. The scripts do not create base tables or modify the citizen-only signup trigger.

## Schema extension

The current migration adds nullable profiles.department_id UUID FK → departments.id ON DELETE RESTRICT, an index, DEPARTMENT membership check/active-membership trigger, DEPARTMENT role and ACCEPTED/RESOLVED_PENDING_VERIFICATION incident statuses. Existing Citizen/Operator/Admin profiles remain valid with NULL membership.

Roles/statuses are text checks, not PostgreSQL enum types. Existing history status columns have no status checks. Audit actor types remain SYSTEM/AI/USER/OPERATOR/ADMIN; Department actions use USER with trusted context.

Browser profile write grants are revoked at table and column levels; existing self-read/RLS and trusted signup behavior remain. No public promotion RPC exists.

## Current function contracts

All parameters below are database types. Actor UUID comes from verified FastAPI identity, never HTTP request input.

| Function | Parameters in order | Writes / return |
| --- | --- | --- |
| civicops_change_incident_status | p_incident_id uuid, p_actor_id uuid, p_expected_updated_at timestamptz, p_new_status text, p_notes text=NULL | incidents/history/audit; incident_id,status,updated_at |
| civicops_assign_incident_department | p_incident_id uuid, p_actor_id uuid, p_expected_updated_at timestamptz, p_department_id uuid, p_notes text=NULL | incidents/assignments/audit, status history on reset; incident_id,department_id,assignment_id,updated_at |
| civicops_assign_and_release_incident | Same assignment parameters | Nested atomic assignment/release; assignment result plus status |
| civicops_review_incident_response_plan | p_incident_id uuid, p_actor_id uuid, p_expected_updated_at timestamptz, p_action text, p_response_plan jsonb=NULL, p_notes text=NULL | incidents/audit; incident_id,response_plan,response_plan_status,updated_at |
| civicops_submit_resolution_feedback | p_report_id uuid, p_incident_id uuid, p_actor_id uuid, p_response text, p_comment text=NULL | feedback/audit; feedback_id,response,review_requested |
| civicops_add_department_work_update | p_incident_id uuid, p_actor_id uuid, p_expected_updated_at timestamptz, p_notes text | incident version/audit; incident_id,updated_at |

civicops_validate_profile_department() is a trigger function, not a public operational API.

Functions use SECURITY INVOKER with empty search_path. EXECUTE is revoked from PUBLIC/anon/authenticated and granted only to service_role. They recheck trusted profiles, lock incident rows and reject stale versions; audit/history failures roll back operational changes. No non-atomic operational fallback exists.

PT403/404/409/422 map to safe HTTP errors; 23505 handles duplicate feedback. Raw database error details must not be exposed.

## Canonical policy and verification

Exact actor-aware transitions, approval/note/assignment gates and reassignment behavior are in [architecture](../../docs/ARCHITECTURE.md). The generated policy block in department_portal.sql must match backend/services/operations.py. For a future policy change:

```powershell
python -m backend.sql.render_status_policy
backend/.venv/Scripts/python.exe -m pytest backend/tests/test_stage4_sql.py -q
```

The renderer updates the current department migration source; it does not execute SQL or repair a live environment. Tests check source alignment/grants/guards; deterministic transport tests model transactions but do not execute PostgreSQL functions.

See [Department provisioning](../../docs/DEPARTMENT_PORTAL.md) and [opt-in live verification](../../docs/TESTING.md). No SQL is executed by documentation updates.
