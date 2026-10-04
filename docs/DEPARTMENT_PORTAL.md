# Department Portal: implementation and manual activation

The code is implemented against the supplied production catalog. **The database
migration has not been applied by the coding agent.** Local deterministic tests
do not establish live PostgreSQL or browser verification.

## Verified schema baseline

`profiles` has six columns: `id uuid` (PK, FK to auth.users with DELETE CASCADE),
`full_name text` nullable, `role text NOT NULL DEFAULT 'CITIZEN'`,
`is_verified boolean NOT NULL DEFAULT false`, and non-null `created_at` /
`updated_at timestamptz DEFAULT now()`. There is no department membership column.

The exact existing checks are `profiles_role_check` and `incidents_status_check`.
Roles/statuses are text, not PostgreSQL enums. Status history has nullable text
`old_status`, non-null text `new_status`, and **no status check constraints**.
`audit_logs_actor_type_check` allows SYSTEM, AI, USER, OPERATOR and ADMIN.

`on_auth_user_created` invokes `public.handle_new_user()`; it explicitly inserts
CITIZEN and false verification, taking only the name from user metadata.
`profiles_set_updated_at` invokes `public.set_updated_at()`. Both stay unchanged.
The only profile policy permits authenticated users to read their own profile.

## Exact SQL to execute manually

Execute the entire [department_portal.sql](../backend/sql/department_portal.sql)
in Supabase Dashboard → SQL Editor as the database owner, **once**, in a maintenance
window. The script uses BEGIN/COMMIT; an error rolls back the migration.
It is not a repeatable bootstrap: new constraints/index/trigger are intentionally
named explicitly, and reapplying it will fail rather than silently replace them.
Do not run the historical Stage 4 script after this migration.

The script:

- Adds nullable `profiles.department_id uuid`, FK to departments.id with DELETE
  RESTRICT, a non-null membership check for DEPARTMENT, and a partial FK index.
- Replaces only the two verified role/status checks, retaining all old values and
  adding DEPARTMENT, ACCEPTED and RESOLVED_PENDING_VERIFICATION.
- Adds a profile trigger validating active department membership on provisioning
  or changes to role/membership. Disabled departments fail backend/RPC checks too.
- Preserves signup, profile timestamp trigger, RLS policies and audit actor checks.
- Revokes browser profile INSERT/UPDATE/DELETE grants, including explicit column
  write grants from the supplied catalog. Self-read remains available. The trusted
  Auth signup trigger and server service_role provisioning remain responsible for writes.
- Replaces the four operational functions and adds one department work-update RPC.
  Browser roles cannot execute them; only service_role can. No SECURITY DEFINER RPC
  and no non-atomic fallback are introduced.

| Function | Parameters | Writes |
| --- | --- | --- |
| `civicops_change_incident_status` | incident UUID, verified actor UUID, expected timestamp, new status, optional notes | incidents, status history, audit |
| `civicops_assign_incident_department` | incident UUID, actor UUID, expected timestamp, department UUID, optional notes | incidents, assignments, audit; history/audit when reassignment resets status |
| `civicops_review_incident_response_plan` | incident UUID, actor UUID, expected timestamp, action, optional JSON plan/notes | incidents, audit; operator/admin only |
| `civicops_submit_resolution_feedback` | report UUID, incident UUID, actor UUID, response, optional comment | feedback, audit; citizen owner only |
| `civicops_add_department_work_update` | incident UUID, actor UUID, expected timestamp, notes | incident version, audit |

Status/RPC signatures preserve existing names. RPCs check roles under profile locks,
lock the incident, check its version, and revalidate active membership/current
assignment. Work-update/status audit details include trusted role, department UUID,
user UUID and private notes. Department actor type is USER.

## Trusted department account provisioning

Normal signup still creates CITIZEN, even if metadata includes role/department.
After signup, use the trusted database-owner/admin workflow to update the profile's
role and department_id **together**, selecting an active seeded department.
No public promotion endpoint/UI exists. Do not use signup metadata for membership.
Existing CITIZEN/OPERATOR/ADMIN profiles remain valid with NULL membership.
One nullable FK is sufficient for the single-department-per-user MVP.

For example, after creating the Auth user, run this through the trusted SQL Editor
workflow, replacing the UUID placeholder and selecting the intended department:

```sql
UPDATE public.profiles
SET role = 'DEPARTMENT',
    department_id = (
      SELECT id FROM public.departments
      WHERE department_key = 'WATER_SUPPLY' AND is_active
    )
WHERE id = '<auth-user-uuid>'::uuid;
```

Confirm exactly one profile was updated. An absent/inactive department fails the
membership trigger/check. Signup metadata cannot perform this promotion.

Confirm the new column/checks/functions and browser write/RPC denial after applying
the migration. Then restart the backend, sign out/in to refresh the frontend trusted
profile, and run the optional live scripts from the repository root:

```text
backend/.venv/Scripts/python.exe backend/tests/live_stage4.py
backend/.venv/Scripts/python.exe backend/tests/live_stage5.py
```

These opt-in scripts use real services, create disposable accounts/data and remove
their own records. They now require this migration and provision a disposable
department member through the trusted client. They do not apply SQL.

## Lifecycle and compatibility

```text
Operator:   RECEIVED → VERIFIED → ASSIGNED
Department: ASSIGNED → ACCEPTED → IN_PROGRESS → RESOLVED_PENDING_VERIFICATION
Operator:   pending verification → RESOLVED or REOPENED
Operator:   REOPENED → reassign/release → ASSIGNED
```

The operator UI now uses **Assign & release** after explicit verification. It
sends `release: true` to the existing assignment endpoint, calling the transactional
`civicops_assign_and_release_incident` wrapper. Assignment, release, history and
audit either all commit or all roll back. The default assignment API behavior
(without `release: true`) remains compatible: assign first, then release separately.
Automatically routed RECEIVED incidents are not department work orders. Starting work requires the existing human-approved plan.
Completion and verification rejection require private notes.

Reassignment closes the previous active assignment and creates a new one. For
ASSIGNED/ACCEPTED/IN_PROGRESS/pending-verification/REOPENED incidents it resets status
to ASSIGNED, atomically recording any status change. The former department loses
queue/detail/evidence/mutation access. Even reassignment to the same department
requires fresh acceptance. Initial intake/review states do not advance implicitly.

Existing IN_PROGRESS rows with an active assignment can submit completion without being reset. Old statuses
remain valid. Direct operator IN_PROGRESS → RESOLVED is intentionally replaced by
the verification gate; old clients must refresh allowed actions. No API fields are
renamed. `/api/auth/me` adds nullable department_id.

Fusion treats both new states as active using the existing conservative matching
criteria. Joining reports changes intelligence/version, never operational status.
It can make a pending operator review stale, requiring refresh, but does not
automatically reopen or revoke completion.

## Endpoints and UI

Department route: `/department/dashboard`, guarded by explicit DEPARTMENT role and
trusted membership. Operators/admins continue at `/operator/dashboard`; citizens
remain at the public reporting/tracking routes.

New endpoints under `/api/department/incidents`:

- GET queue, GET `/{id}`, GET `/{id}/actions`.
- GET `/{id}/history`: status/time only, no historical private operator notes/IDs.
- GET `/{id}/updates`: current department's private work/completion notes.
- POST `/{id}/status`: department acceptance/start/completion only.
- POST `/{id}/updates`: versioned private work update.

GET `/api/incidents/{id}/work-history` lets operators review department notes.
Existing incident evidence listing and report evidence download now allow the
currently assigned department with an active assignment and released work state.
Report uploads remain owner-only; department completion-photo upload is absent.
Private storage paths and public permanent URLs remain undisclosed.

The department queue filters Assigned, Accepted, In progress and Awaiting
verification. Details reuse existing incident adapters and evidence components,
show the response plan, history and private updates, and offer Accept Assignment,
Start Work, Add Work Update and Submit Completion. The operator queue adds Pending
verification plus Approve Resolution / Reject–Reopen controls.

Citizen tracking shows the added real statuses. Only final operator-confirmed
RESOLVED enables owned-citizen feedback. YES/PARTIALLY/NO and duplicate protection
remain unchanged; negative feedback never reopens automatically.

## Verification and limitations

Local checks: 184 backend tests passed (3 optional tests skipped), 29 frontend tests
passed, TypeScript/production build and lint passed, and git diff --check passed.
The production build retains its existing large-bundle warning. The updated live
scripts were syntax checked but were not executed before database migration.

Local tests cover role/department isolation, forged membership, inactive membership,
actor-specific transitions, approval gate, required notes, stale versions, reassignment,
RPC membership rechecks, audit rollback, private evidence and feedback before/after
verification. Frontend tests cover route/session allowlists, labels and API payloads.

Live SQL application and PostgreSQL execution remain pending. Browser acceptance is
also pending: verify department login, all queue filters/actions, evidence reads,
operator rejection/reassignment/approval, citizen tracking and final feedback.
No department completion uploads, notifications, multi-department membership or
public role administration were added. Dashboard refresh is manual. Historical
operator notes remain private; only department work updates are shown for completion
review. Existing bundle-size/dependency deprecation warnings remain.


## Queue and map correction

The live read-only diagnosis confirmed the WATER_SANITATION account has trusted
DEPARTMENT membership in an active department. Its three routed incidents were
all RECEIVED, including two with active assignments. None qualified for the work
queue. Do not automatically verify those incidents or relax the queue checks.

For an existing database where the Department Portal migration is already applied,
execute only [department_assignment_release.sql](../backend/sql/department_assignment_release.sql)
in Supabase SQL Editor. This repeatable patch adds one server-only RPC; it changes
no tables, checks, roles, policies or existing data. Fresh installations receive
the same RPC from the full migration. Do not rerun the one-time full migration.

`civicops_assign_and_release_incident(uuid, uuid, timestamptz, uuid, text)` accepts
incident ID, trusted actor ID, expected incident version, active department ID and
optional notes. It requires OPERATOR/ADMIN, locks the profile and incident, rejects
unverified/closed states and stale versions, then calls the existing assignment
and status functions within one transaction. Those functions retain their active
assignment closure, history and audit behavior. It returns the assignment result
plus current status and updated_at. Only service_role can execute it.

Both dashboards now reuse `IncidentMap`, Leaflet CSS and the existing fixed-height
map styling. Only authorized queue rows are supplied to the department map. Finite,
in-range coordinates produce markers; selection focuses the map. Missing coordinates
retain the queue/detail view with an explicit message or empty map state.

After applying the patch and restarting the backend:

1. As an operator, open an intended incident and explicitly change RECEIVED to VERIFIED.
2. Select WATER_SANITATION and click Assign & release. Confirm status ASSIGNED.
3. Sign in as wasa@department.pk and open /department/dashboard. Confirm the incident,
   location marker (when coordinates exist), detail and evidence access.
4. Select a different mapped incident and confirm the map focuses its coordinates.
   Select an incident without coordinates and confirm its written location remains visible.
5. Click Accept Assignment, refresh, and confirm persisted ACCEPTED status.
6. Sign in as another department: the incident must be absent and its detail denied.
7. Reassign through the operator dashboard and confirm the previous department loses
   queue/detail/evidence/action access. Completed assignments must not confer access.

Browser automation was unavailable because its runtime failed before startup.
The SQL patch has been prepared, not applied by the agent. Live end-to-end acceptance
of this patch remains pending manual SQL execution and the checks above.
