# CivicOps AI backend: Stages 1 and 2

Run from the repository root with Python 3.12:

```powershell
backend/.venv/Scripts/python.exe -m uvicorn backend.main:app
backend/.venv/Scripts/python.exe -m pytest backend/tests -q
```

The server loads backend/.env without overriding existing environment variables.
Provide SUPABASE_URL and SUPABASE_SECRET_KEY server-side. Missing configuration
fails startup with variable names only. Never put secrets in Vite variables,
browser code, logs, or source control.

## Reports and idempotency

POST /api/reports and GET /api/reports/{public_id} keep existing field names.
internal_id is the report UUID. Public identifiers use CV- plus random hexadecimal
characters. Idempotency is scoped to PUBLIC; Idempotency-Key overrides the request
submission_id as the durable key. The response retains the original request ID.
Matching retries return HTTP 201 with idempotent_replay=true; conflicting payloads
return 409. A private _intake_request_v1 JSONB supporting signal stores the original
submission ID and payload fingerprint, and is filtered out of API evidence.

AI failures remain PENDING/AI_PENDING. Invalid or unstated reported urgency is NULL
in the database; recognized claims normalize to LOW/MEDIUM/HIGH/CRITICAL. The legacy
response still uses Medium when no claim is recorded. Report processing_status is
separate from incident operational status. Pending/rejected/non-civic/archived
reports do not enter fusion. Successful civic reports become LINKED after incident
aggregation and audits succeed.

Stage 2 adds nullable incident_id to report responses. Report status and priority
reflect the linked persistent incident when present; report evidence and spam
fields remain report-level. Historical Stage 1 reports are linked on POST retry,
not bulk migrated. No background AI retry or reconciliation worker is installed.

## Conservative fusion

Candidates have the same category, are unarchived and operationally active, and
originated within 24 hours before the incoming report. Resolved/rejected incidents
are never automatically reopened. Every comparison anchors to the seed report,
preventing location drift through a chain of matches.

The algorithm is token-set Jaccard similarity, a Haversine distance calculation,
and timestamp comparison. It uses original text, AI summary when both exist, and
landmark text; the smaller original/summary similarity controls content matching.
It is not semantic matching, media analysis, or independent-source validation.

With both coordinate pairs present, matching requires distance <=40 metres,
landmark similarity >=0.85, content similarity >=0.75, and a weighted score >=0.85.
Weights: content 0.35, landmark 0.30, distance 0.25, time 0.10.
Without both coordinate pairs, an exact specific landmark with >=3 tokens is
required, along with content similarity >=0.90, time <=6 hours and score >=0.94.
Weights: content 0.60, landmark 0.30, time 0.10. Missing location evidence is never
invented. A shared specific site marker (e.g. named school/gate/house/pole) is
required; a road or area name alone is insufficient. At least four report-text
tokens are required; OTHER and spam risk >=0.5 never auto-match. If the two best
eligible candidates differ by less than 0.08, create a new incident.

incident_reports records score, method, and numeric decision details. The seed
link uses NEW_INCIDENT_V1 and no match score because no existing match was made.
Matched links use TOKEN_SIMILARITY_DISTANCE_TIME_V1. One report has at most one
incident, enforced by the existing database unique constraint.

## Persistent incident intelligence and reads

GET /api/incidents remains a bare array. GET /api/incidents/{incident_id} accepts
a UUID or incident_code; legacy report public IDs resolve through the link table.
incident_id now identifies the incident UUID. Additive fields: incident_code and
response_plan_status. Location field names and department code strings remain.
Departments resolve from the live departments.department_key seed rows; water
supply routes to WATER_SUPPLY. REOPENED is supported. INSPECTION is not a status.

Report count is derived from links; it is not an incident-table column. Evidence
and spam use the largest reported heuristic score, with no boost for report count.
Priority keeps the higher of existing incident priority and rules-derived linked
report priorities. Public supporting signals are deduplicated and include an honest
linked-submission count. Initial summary/location are retained. Fusion never
changes an existing operational status, department, or response-plan approval.
Response plans remain PENDING suggestions; no dispatch action is performed.

Dashboard totals now use persistent incidents; total_active excludes resolved and
rejected incidents. The existing summary field names remain.

## Auditability, recovery and limits

SYSTEM audit rows record INCIDENT_CREATED, AUTOMATIC_MATCH_DECISION and REPORT_LINKED.
Initial RECEIVED status history is recorded. Audit details contain IDs and numeric
match evidence, not report text, auth data, or private fingerprint metadata.

No schema changes or new RPCs were applied. Several PostgREST writes cannot form
one transaction with the existing API. Stable UUIDs make creation, links, audit
rows and initial history repeatable. Unique link failures recover the existing
winner. Audit/link/aggregation failures return a sanitized 503; retrying the same
report completes missing work. Aggregation uses updated_at compare-and-swap with
bounded retries. Report processing becomes LINKED last. A hard failure can leave
an unlinked seed incident pending retry. Two simultaneous different reports can
create separate incidents before either sees the other's link. A retry worker or
transactional database function is future work; no exactly-once transaction claim
is made. Read joins currently trade efficiency for simplicity (multiple queries).

The old unauthenticated status/assignment POST endpoints return 501 rather than
perform privileged operational changes. Persistent operator workflows, assignment
history, authorization and authenticated human approvals are deferred. Read access
control remains deferred too. Frontend integration and deployment are not included.

Tests use the installed Supabase SDK with a deterministic disk-backed test
transport. They include fresh-process reads, match/nonmatch/location/time cases,
unique linking, audit replay, partial failure repair and stale aggregate rejection.
Optional live Groq tests require explicit opt-in.


## Stage 4: authentication and atomic operations

Use Supabase Auth in the browser with publishable credentials only. FastAPI checks
Bearer tokens with Supabase Auth get_user(token) and loads the trusted profiles
role per request. GET /api/auth/me replaces the removed hardcoded /auth/login.
OPERATOR/ADMIN are required for all incident reads, dashboard summaries and
operator actions. CITIZEN cannot mutate incidents, regardless of JWT metadata.

Authenticated report submissions persist reporter_id and use a per-user retry
scope; anonymous submissions retain PUBLIC scope. Owned reports require their
owner or an operator. Safe tracking history is available at
GET /api/reports/{public_id}/tracking and omits notes and changed_by.

Private POST /api/incidents/{id}/notes is enabled and persists one audit_logs row.
Status, department assignment, response-plan review and resolution feedback now
call the four applied transaction RPCs documented in [sql/README.md](sql/README.md).
History and audit writes commit atomically with their operations. Incident responses
include additive updated_at; mutation requests accept expected_updated_at for
stale-edit protection. Status transitions are centralized and mirrored in SQL.
IN_PROGRESS requires human plan approval. Feedback requires a citizen-owned report
linked to a resolved incident; NO/PARTIALLY flag review without reopening it.

FRONTEND_ORIGINS may add explicit comma-separated trusted frontend origins.
Defaults include http://localhost:5173 and http://127.0.0.1:5173. Wildcard origins
and credentialed CORS are not enabled. Existing signup-trigger/RLS role protections
remain unchanged. Account creation/password reset/admin promotion UI are deferred.


## Stage 5: private evidence and production configuration

Private owner uploads and owner/operator evidence reads now use FastAPI and the
private report-evidence Storage bucket. Image/audio content is validated and
normalized before storage; report_media stores paths/hashes rather than public URLs.
Local audio support requires ffmpeg and ffprobe on PATH. Railway's Dockerfile
installs them. Anonymous text-only reporting remains available.

APP_ENV=production enables required-key/model/origin validation. See
[deployment readiness](../DEPLOYMENT_READINESS.md) for exact Railway/Vercel commands,
environment variables, Auth redirects, limitations and manual browser acceptance.
[Stage 5 changes](STAGE5_CHANGES.md) lists all files and verification results.
The earlier Stage 4 account/media deferrals above are superseded by Stage 5.
