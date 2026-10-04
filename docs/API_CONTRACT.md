# CivicOps AI API contracts

Source: backend routes and Pydantic models; runtime OpenAPI is available at /openapi.json and /docs. No frontend field renames are required. All application routes below are registered in [main.py](../backend/main.py).

## Authorization and reads

Send Authorization: Bearer <Supabase access token> for authenticated requests. FastAPI verifies identity and reads trusted profiles. Operator means OPERATOR or ADMIN, never any non-citizen. Department means DEPARTMENT with active verified membership and a current released assignment.

Public report reads are allowed only for unowned anonymous reports; owned reports require owner or Operator/Admin. Department access to other citizens' evidence is incident-scoped, not general report access; owner checks still apply to a department user's own submissions.

| Method | Route | Auth / allowed access | Purpose |
| --- | --- | --- | --- |
| GET | /health | Public | Application liveness; not cloud dependency health |
| GET | /api/auth/me | Authenticated, valid trusted profile | user_id, role, nullable department_id |
| POST | /api/reports | Optional valid auth | Persist report; process/link eligible civic report |
| GET | /api/reports/{public_id} | Public unowned / owner / Operator | ReportResponse |
| GET | /api/reports/{public_id}/tracking | Same report-read rules | Safe location/history and feedback eligibility |
| GET | /api/incidents | Operator | Bare incident array, unarchived incidents |
| GET | /api/incidents/{incident_id} | Operator | IncidentResponse |
| GET | /api/incidents/{incident_id}/actions | Operator | allowed_statuses |
| GET | /api/incidents/{incident_id}/work-history | Operator | Department work/completion notes for review |
| GET | /api/dashboard/summary | Operator | total_active, critical, awaiting_verification, resolved |
| POST | /api/incidents/{incident_id}/status | Operator | Actor-valid status transition |
| POST | /api/incidents/{incident_id}/assign | Operator | Assignment; release:true performs Assign & Release |
| POST | /api/incidents/{incident_id}/response-plan | Operator | APPROVE / MODIFY / REJECT |
| POST | /api/incidents/{incident_id}/notes | Operator | Private audit note |
| GET | /api/department/incidents | Department | Own released active queue |
| GET | /api/department/incidents/{incident_id} | Assigned Department | IncidentResponse |
| GET | /api/department/incidents/{incident_id}/actions | Assigned Department | allowed_statuses |
| GET | /api/department/incidents/{incident_id}/history | Assigned Department | Safe old/new status and timestamp only |
| GET | /api/department/incidents/{incident_id}/updates | Assigned Department | Current department's private notes |
| POST | /api/department/incidents/{incident_id}/status | Assigned Department | Accept, start, submit completion |
| POST | /api/department/incidents/{incident_id}/updates | Assigned Department | Versioned private work update |
| POST | /api/feedback | CITIZEN owner | One response for linked, finally RESOLVED incident |
| POST | /api/reports/{public_id}/media | Signed-in owner | Validated private raw-byte upload |
| GET | /api/reports/{public_id}/media | Owner / Operator | Safe evidence metadata |
| GET | /api/incidents/{incident_id}/media | Operator / assigned Department | Linked-report evidence metadata |
| GET | /api/reports/{public_id}/media/{media_id} | Owner / Operator / assigned Department | Authorized bytes, private/no-store |

Incident lookup resolves database UUID, incident_code, or legacy report public ID through incident_reports. Department lookup still enforces assignment restrictions. Queue responses are bare arrays without server filter/pagination parameters; repository reads internally paginate.

Login, signup, password recovery and token refresh use Supabase Auth directly. There is no FastAPI password-login/signup endpoint.

## Report input and response

ReportCreate ([model](../backend/models/report.py)):

| Field | Type / default | Validation or meaning |
| --- | --- | --- |
| submission_id | Required string | Client normally generates UUID; backend does not enforce UUID syntax |
| text | Required string | At least 3 characters |
| language | String, en | UI sends en / ur / roman_urdu; no backend language enum |
| latitude | Nullable number | -90 to 90 |
| longitude | Nullable number | -180 to 180 |
| landmark_text | Nullable string | Trimmed; blank becomes null |
| image_url | Nullable string | Legacy compatibility input; not upload persistence |

Location may be manual-only, GPS-only, both or absent. Coordinate fields are independently nullable. Optional Idempotency-Key overrides the durable submission key; matching replay returns 201, conflict 409.

ReportResponse fields:

```text
public_id, internal_id, incident_id (nullable), submission_id,
status, ai_status, category, reported_urgency, priority,
evidence_confidence, supporting_signals, spam_risk, idempotent_replay
```

internal_id is the report UUID; incident_id is the linked incident UUID. Status/priority reflect the incident if linked. Report confidence/spam remain report-level. Signals have signal/detail/impact strings.

Pending AI is represented by ai_status=PENDING and nullable incident_id. For backward compatibility the response supplies OTHER, Medium and RECEIVED when extraction/linking is absent; these do not prove classification succeeded. Report processing_status lives in persistence, not this response. Injection returns 400 after persisting rejection.

TrackingDetailsResponse fields:

```text
public_id, incident_code (nullable),
location: {latitude, longitude, landmark},
history: [{old_status (nullable), new_status, created_at}],
can_submit_feedback, feedback_response (nullable)
```

History excludes notes, user IDs and audit metadata. ReportResponse itself does not include location; use the tracking read.

## Incident contract

IncidentResponse ([model](../backend/models/incident.py)):

```text
incident_id, updated_at, incident_code, category, title, summary,
location: {latitude, longitude, landmark},
priority, evidence_confidence, supporting_signals, spam_risk,
report_count, department, status, response_plan,
response_plan_status, reported_urgency
```

department is a seeded department code, not a UUID. report_count is derived from links. response_plan is an array of strings. Location values may be null. No assigned_at, location_confidence or full per-link matching rationale is returned. Counts and summary totals are not invented daily metrics: resolved is all-time unarchived resolved incidents; awaiting_verification counts RECEIVED/NEEDS_REVIEW, not completion verification.

## Operational request bodies

| Model / endpoint | Fields |
| --- | --- |
| StatusUpdateRequest, both status routes | status: incident enum; notes: nullable string <=2,000; expected_updated_at: nullable datetime |
| AssignDepartmentRequest | department: department enum; notes <=2,000; expected_updated_at; release: boolean default false |
| ResponsePlanRequest | action: APPROVE/MODIFY/REJECT; response_plan: nullable string array <=30; notes <=2,000; expected_updated_at |
| OperationalNoteRequest | notes: required string, 1–2,000 characters, nonblank |
| DepartmentNoteRequest | notes: required string, 1–2,000, nonblank; expected_updated_at |
| FeedbackCreate | public_id: string 1–80; incident_id: UUID; response: YES/PARTIALLY/NO; comment: nullable string <=2,000 |

UI mutations supply the last received updated_at. The request field is optional for compatibility; omission uses the backend's fresh read version. 409 requires refresh/review rather than blind overwrite.

MODIFY needs 1–30 nonblank steps, <=1,000 characters per step. APPROVE/REJECT cannot include a replacement plan. MODIFY clears approval; a separate APPROVE is required. Exact actor/status/note/assignment gates are in the [canonical lifecycle](ARCHITECTURE.md).

Operational result objects:

| Action | Returned fields |
| --- | --- |
| Status | incident_id, status, updated_at |
| Assignment | incident_id, department_id, assignment_id, updated_at |
| Assign & Release | Assignment fields plus status |
| Plan review | incident_id, response_plan, response_plan_status, updated_at |
| Department update | incident_id, updated_at |
| Operator note | status: recorded, created_at |
| Feedback | feedback_id, response, review_requested |

Department/Operator work-history entries contain notes, created_at and action. Department history entries contain old_status, new_status, created_at only.

## Media contract

POST media takes raw bytes with matching Content-Type, query upload_id (UUID) and filename (1–200 characters); it is not multipart. The filename validates type, not authorization/object naming. Retry identity is report-scoped and content conflicts return 409.

Safe metadata fields: media_id, media_type, mime_type, created_at, size_bytes. Incident media listing adds public_id for protected download. Paths, tracking tokens and permanent public URLs are not returned. IMAGE/AUDIO are accepted; OTHER has no uploader.

JPEG/PNG/WebP <=10 MiB, single frame <=12 million pixels, normalize to JPEG. Audio WebM/MP4/M4A/MP3/WAV <=15 MiB, one audio-only stream <=5 minutes, normalizes to WebM/Opus. FFmpeg/ffprobe are needed for audio.

## Errors

Public errors retain FastAPI detail. Important states: 400 rejected intake, 401 invalid/missing token, 403 forbidden, 404 absent/inaccessible record, 409 payload/version/lifecycle/feedback conflict, 413 media size, 415 invalid type/content, 422 validation, 429 media processing slots busy, 503 unavailable storage/Auth/processing. Database/provider details are sanitized. The current routes do not intentionally use 501 operational placeholders.
