# CivicOps AI backend

FastAPI/Pydantic with server-only Supabase persistence, Groq intake, conservative fusion, trusted role authorization, transactional operations and private evidence.

## Setup and execution

From repository root, Python 3.12:

```powershell
py -3.12 -m venv backend/.venv
backend/.venv/Scripts/Activate.ps1
python -m pip install -r backend/requirements.txt
uvicorn backend.main:app --reload
```

Copy .env.example to backend/.env only if absent. database.py loads that file without overriding hosting/process variables. SUPABASE_URL and SUPABASE_SECRET_KEY are required at startup. GROQ_API_KEY and LLM_MODEL enable intake; missing/unavailable AI remains pending in development. APP_ENV=production requires them plus FRONTEND_ORIGINS and validates HTTPS configuration. Never log/expose secrets.

FFmpeg and ffprobe on PATH are required for audio. Pillow handles images. See [deployment configuration](../docs/DEPLOYMENT_READINESS.md).

## Modules

- main.py: lifespan client and router/CORS registration; /health is liveness only.
- auth.py: Supabase token verification, fresh trusted profile and explicit role/assignment checks.
- models/: API bodies, responses and category/department/status enums.
- routes/: reports, incidents, department, dashboard, auth, feedback and media.
- repositories/: Supabase queries, uniqueness/retry handling, CAS and RPC dispatch.
- services/: structured extraction, adapters, fusion, rules, lifecycle policy and evidence validation.
- sql/: current transactional functions and historical migration definitions.
- tools/prepare_storage.py: explicit private-bucket setup.
- tests/: deterministic SDK transport/Auth/Storage doubles and opt-in real-service verifiers.

Compatibility helpers remain in services/supabase_client.py and utils/helpers.py; they do not own persistence. services/audit_service.py is a legacy logging helper, not the persistent operational audit path.

## Persistence and intake

Report/incident/link/idempotency state lives in PostgreSQL, not process dictionaries. Report retries use PUBLIC or USER:<verified UUID> scope and database uniqueness; changed payload reuse returns 409.

Groq validates extraction categories/schema for English, Urdu and Roman Urdu. Failure leaves PENDING/AI_PENDING and no incident. Report processing is separate from incident status. Manual landmark/GPS values persist independently; blank landmark becomes null, and no-location submissions remain valid.

Fusion uses same-category lexical/landmark/distance/time agreement anchored to the seed report. It never merges on category/road name alone and does not claim embeddings/media corroboration. Count derives from links; aggregation preserves operational fields. Fusion writes have stable IDs/replay repair/CAS, not one transaction.

Priority and trust scores are basic deterministic heuristics; plans are template suggestions. Uploaded media does not trigger AI analysis or automatic score updates. Exact thresholds and limitations are in [architecture](../docs/ARCHITECTURE.md).

## Operational security

Operator/Admin routes and Department routes use separate allowlists. Department access requires current active membership, current department, an active assignment and a released work state. Assign & Release uses one transactional RPC. Department accepts/starts/submits completion; only Operator/Admin can finalize resolution or reopen.

Current status/assignment/plan/feedback/work-update RPCs atomically write their operational state and audit/history. UI passes expected_updated_at; stale writes return 409. Private Operator notes are a single audit insert without incident CAS. Read-safe history omits notes/actor IDs.

Owner-only media uploads validate content and normalize to private JPEG/WebM objects. Authorized reads return protected bytes. Storage/metadata retries reconcile retained objects; no orphan cleaner exists. Two processing slots per process bound media work; this is not a general rate limiter.

## References and checks

- [API models/routes](../docs/API_CONTRACT.md)
- [Canonical roles/lifecycle/database](../docs/ARCHITECTURE.md)
- [SQL applicability and grants](sql/README.md)
- [Department provisioning/workflow](../docs/DEPARTMENT_PORTAL.md)
- [Testing and manual acceptance](../docs/TESTING.md)

```powershell
backend/.venv/Scripts/python.exe -m pytest backend/tests -q
git diff --check
```

No background AI retry, fusion repair worker, automatic reopening or dispatch is installed. The repository does not include a complete base-schema bootstrap.
