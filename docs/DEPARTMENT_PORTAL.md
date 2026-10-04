# CivicOps AI Department Portal

The Department Portal is implemented. This guide covers membership, queue eligibility and use; [architecture](ARCHITECTURE.md) owns the exact lifecycle/permission matrix and [SQL README](../backend/sql/README.md) owns migration applicability.

## Identity and trusted provisioning

DEPARTMENT is an explicit profiles.role value. profiles.department_id is a nullable UUID FK to departments.id, sufficient for the single-department-per-user MVP. Citizen/Operator/Admin profiles may remain NULL. Department profiles require an active valid department, checked during provisioning, backend authentication and RPC operations.

The existing Auth trigger creates every new profile as CITIZEN with is_verified=false regardless of signup metadata. Public signup has no role/department inputs. There is no public promotion endpoint or UI.

Create the Auth account normally, then use a trusted database-owner/server process to set role and membership together. Example SQL for that trusted workflow only:

```sql
UPDATE public.profiles
SET role = 'DEPARTMENT',
    department_id = (
      SELECT id FROM public.departments
      WHERE department_key = '<seeded-department-key>' AND is_active
    )
WHERE id = '<auth-user-uuid>'::uuid;
```

Confirm exactly one intended profile changed. Missing/inactive membership fails. Do not publish account credentials, real user IDs or private email addresses in docs. After trusted promotion, reload/sign out and back in to refresh displayed identity. Backend authorization always reads current roles.

Dashboard identity uses /api/auth/me for role/membership, then optional Auth account and matching RLS-protected department display-name reads. Display enrichment does not authorize access or override membership; fallback labels remain safe.

## Queue eligibility

GET /api/department/incidents returns an incident only when all hold:

- Authenticated role is DEPARTMENT with active trusted membership.
- Incident is unarchived and current_department_id matches that membership.
- Matching incident_assignments row has completed_at IS NULL.
- Status is ASSIGNED, ACCEPTED, IN_PROGRESS or RESOLVED_PENDING_VERIFICATION.

Automatic routing of a RECEIVED incident is not a released work order. An active assignment alone is also insufficient. Empty queues should be diagnosed through role/membership → current department → active assignment → released status, not by loosening checks.

## Operator release and department work

1. Operator explicitly verifies the incident.
2. Operator selects a seeded department and uses **Assign & Release**.
3. The assignment-release RPC closes previous active assignments, creates the new one and sets ASSIGNED in one transaction.
4. Department sees its authorized assignment and selects **Accept Assignment** → ACCEPTED.
5. Operator must approve the nonempty response plan; Department selects **Start Work** → IN_PROGRESS.
6. Department records private work updates and submits a nonblank completion note → RESOLVED_PENDING_VERIFICATION.
7. Operator reads work history and selects **Approve Resolution** → RESOLVED or **Reject / Reopen** with a reason → REOPENED.
8. Eligible citizen owners can give feedback only after final RESOLVED.

Department cannot assign/reassign, change priority, review AI plans, finalize resolution, reopen or access Operator dashboard. Operator/Admin cannot skip Department acceptance/start/completion via the status endpoint.

Backend /actions supplies allowed statuses. Work-update API also permits assigned and pending-verification work states; the current UI exposes Add Work Update during ACCEPTED/IN_PROGRESS and a read-only pending-verification action area.

## Dashboard and map

Route /department/dashboard uses explicit DEPARTMENT/membership protection. It includes:

- Actual department/account identity.
- New, Accepted, In Progress, Pending Verification and Total Active counts from the authorized queue only.
- Combined local status, priority, category and text search filters, filtered count/reset.
- Incident IDs, category, summary, written location, priority/status, report count, confidence and updated time.
- Selected incident intelligence, separate spam risk/confidence, supporting signals, plan/approval state, authorized citizen evidence, safe status history and private work history.
- Contextual actions, real busy/success/error states, manual refresh and stale-version conflict messaging.

The API does not return assignment time; queue time is explicitly Updated, not invented Assigned time. It also does not expose full match decisions/location confidence.

Both dashboards share IncidentMap: Leaflet/React Leaflet, MapTiler Streets-v4, marker/popups and queue selection synchronization. Department map receives all authorized queue incidents, independent of list filters. Selecting a filtered-out marker clears list filters to show it. Null/invalid coordinates produce no marker; written landmarks/details remain. Missing VITE_MAPTILER_API_KEY shows configuration fallback. No incidents outside the authorized queue are loaded for filtering/maps.

## History, evidence and reassignment

Status history exposes old/new status and timestamp, never private Operator notes/actor IDs. Department work updates are audit-backed and scoped to the current department's verified context. Operators may read department work notes for completion review.

Authorized linked citizen evidence uses existing private-media FastAPI reads. Department cannot upload evidence to someone else's report. Department completion-photo upload is absent.

Reassignment closes previous active assignments and resets work states to ASSIGNED, including reassignment to the same department. Fresh acceptance is required. The previous department immediately loses queue/detail/evidence/mutation authorization. Final RESOLVED/REOPENED and completed assignments are not accessible in the current Department queue; there is no Department completed-work archive.

Fusion may update intelligence/version while work is active but never overwrites workflow state. Refresh after stale expected_updated_at conflicts.

## Database activation and verification

Do not assume any live environment's migration state from this guide. Inspect installed schema/RPCs and follow [SQL applicability](../backend/sql/README.md). department_portal.sql is one-time; the latest version includes the release wrapper. Older migrated environments may need only department_assignment_release.sql. Historical Stage 4 definitions must not be reapplied.

[Testing/demo verification](TESTING.md) covers queue isolation, lifecycle, approval/note gates, evidence revocation, stale updates, persistence and final-feedback eligibility. Deterministic tests do not establish live SQL/browser execution. No migration is executed by documentation synchronization.

Current limits: one department per user, manual refresh, no completion photos, notifications, workload balancing, public role administration or completed Department archive.
