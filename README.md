# CivicOps AI

CivicOps AI is a multilingual civic incident intelligence and operations platform that turns citizen reports into structured, deduplicated, actionable incidents for human operators. Citizens describe local issues in English, Urdu or Roman Urdu; AI structures the intake, conservative matching groups related reports, and authorized operators manage a persistent response workflow with human approval, tracking and feedback.

## Problem

Civic complaints often arrive through fragmented channels. Duplicate reports obscure the scale of an issue, language barriers make reporting harder, and weak routing delays the right department's response. Citizens lack clear progress updates, while authorities lack a shared operational picture. Accessibility and limited connectivity add further friction.

## Solution

```text
Citizen Report
    → Multilingual AI Intake
    → Classification / Risk / Spam Analysis
    → Incident Fusion
    → Operator Dashboard
    → Human Review & Response
    → Status Tracking & Feedback
```

The current intake channel is the web portal. WhatsApp and SMS are future intake channels.

## Key features

- **Accessible reporting:** English, Urdu and Roman Urdu text intake; anonymous text-only submission; authenticated citizen accounts with signup and password reset.
- **Private evidence:** optional image and audio uploads for signed-in report owners, validated and normalized by the backend.
- **Structured intake:** AI classification and summary, reported urgency, injection detection, and separate evidence-confidence and spam-risk estimates. AI failures retain truthful pending states.
- **Reliable persistence:** durable submission idempotency, conflict detection and report tracking IDs.
- **Incident intelligence:** conservative report fusion, derived report counts, stored matching decisions and supporting signals.
- **Operations workspace:** incident queue, filters, map-based incident view, department assignment, operational notes and status history.
- **Human control:** operator authentication, trusted role authorization, response-plan approval/modification/rejection, and audited operational actions.
- **Citizen visibility:** report tracking, real status history, owned-report evidence access and eligible resolution feedback.

## Why CivicOps is different

CivicOps carries a report through an operational workflow beyond the initial conversation. Multiple reports can become one persistent incident, with matching based on explicit category, location, time and text criteria. Uncertain matches remain separate. AI recommendations are distinct from human decisions, and sensitive response actions require operator approval. Multilingual reporting makes that workflow accessible to more citizens.

## Architecture

```text
React / Vite Frontend ─────────→ Supabase Auth
        │                         login / session
        │ Bearer access token
        ↓
FastAPI Backend
        │
        ├───────────────┬────────────────────────┐
        ↓               ↓                        ↓
    Groq LLM       Supabase PostgreSQL     Private Supabase Storage
    AI intake      reports / incidents     image / audio evidence
                   profiles / history
                   feedback / audit
```

Supabase Auth provides identity. FastAPI verifies access tokens and loads trusted roles from `profiles`; frontend role input is never authoritative. Privileged database operations and evidence access go through FastAPI. The frontend receives only the Supabase URL and publishable key, **never `SUPABASE_SECRET_KEY`**.

## Tech stack

| Layer | Technologies |
| --- | --- |
| Frontend | React, TypeScript, Vite, Tailwind CSS, Leaflet / OpenStreetMap, Supabase JS |
| Backend | Python 3.12, FastAPI, Pydantic, Groq, Supabase Python SDK, Pillow, FFmpeg / ffprobe |
| Infrastructure | Supabase Auth, PostgreSQL, private Supabase Storage; Railway-ready backend and Vercel-ready frontend |

## Repository structure

```text
civicops-ai/
├── backend/
│   ├── main.py                 # FastAPI application
│   ├── models/                 # Request/response schemas and enums
│   ├── routes/                 # API endpoints
│   ├── repositories/           # Persistent database access
│   ├── services/               # Intake, fusion, operations and evidence
│   ├── sql/                    # Atomic operational RPC definitions
│   ├── tests/                  # Unit, integration and optional live checks
│   ├── tools/                  # Private storage provisioning helper
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/                    # Pages, components, auth and API services
│   ├── tests/                  # API adapter and account/session tests
│   └── vercel.json
├── docs/                       # Product, design and deployment documentation
├── railway.json
└── .dockerignore
```

## Local setup

Prerequisites: Python 3.12, Node.js 24 with npm, a configured Supabase project, a Groq API key, and `ffmpeg` / `ffprobe` on `PATH` for audio evidence.

**1. Create and activate the backend environment** from the repository root:

```powershell
py -3.12 -m venv backend/.venv
.\backend\.venv\Scripts\Activate.ps1
python -m pip install -r backend/requirements.txt
```

On macOS/Linux, use `python3.12 -m venv backend/.venv` and `source backend/.venv/bin/activate` before installing dependencies.

**2. Install frontend dependencies:**

```text
cd frontend
npm ci
cd ..
```

**3. Configure environment files.** Create `backend/.env` and `frontend/.env` using their respective `.env.example` files if they do not already exist. Preserve existing local credentials. See the variables below.

**4. Prepare the Supabase environment.** The application requires the existing database contract, seeded departments, RLS policies and the Auth-to-`profiles` trigger that creates citizens. The repository does not contain a complete fresh-database bootstrap. Apply the operational functions following [backend/sql/README.md](backend/sql/README.md). Configure Auth redirect URLs for `/auth/callback` and `/auth/reset` on your frontend origin.

For a new environment, provision the private evidence bucket after configuring backend credentials:

```text
python -m backend.tools.prepare_storage
```

**5. Run FastAPI** from the repository root with the virtual environment active:

```text
uvicorn backend.main:app --reload
```

API: `http://127.0.0.1:8000`; interactive API documentation: `http://127.0.0.1:8000/docs`; health check: `/health`.

**6. Run the frontend** in a second terminal:

```text
cd frontend
npm run dev
```

Open `http://localhost:5173`. Operator access requires a profile promoted through a trusted administrative process; public signup creates citizens only.

## Environment variables

Backend — `backend/.env`:

```dotenv
SUPABASE_URL=<supabase-project-url>
SUPABASE_SECRET_KEY=<server-only-secret-key>
GROQ_API_KEY=<groq-api-key>
LLM_MODEL=<supported-groq-model>
APP_ENV=development
```

For production, set `APP_ENV=production` and `FRONTEND_ORIGINS` to your configured HTTPS frontend origin(s). Production configuration validates required settings. Local development permits the configured localhost origins without wildcard credentialed CORS.

Frontend — `frontend/.env`:

```dotenv
VITE_API_URL=http://127.0.0.1:8000
VITE_SUPABASE_URL=<supabase-project-url>
VITE_SUPABASE_PUBLISHABLE_KEY=<supabase-publishable-key>
```

**Never place `SUPABASE_SECRET_KEY` or `GROQ_API_KEY` in frontend files or `VITE_*` variables.** Frontend build variables are browser-visible. Environment files are excluded from version control.

## Database / core tables

| Purpose | Tables |
| --- | --- |
| Identity and routing | `profiles`, `departments` |
| Citizen intake and evidence | `reports`, `report_media` |
| Incident intelligence | `incidents`, `incident_reports` |
| Operational history | `incident_assignments`, `incident_status_history` |
| Accountability | `resolution_feedback`, `audit_logs` |

Many reports can link to one incident; each report belongs to at most one incident. Report processing status remains separate from incident operational status. Reported urgency is distinct from final incident priority, and evidence confidence is distinct from spam risk.

## Security

- RLS is enabled; the privileged Supabase key remains backend-only. FastAPI enforces authorization because privileged server access must not rely on browser restrictions.
- Verified identity and trusted profile roles separate citizen access from operator/admin actions. Signup cannot grant elevated roles.
- Evidence stays in private storage. Backend ownership/role checks mediate uploads and downloads; permanent public URLs are not used.
- Operational RPCs atomically persist changes, history and audit events. `expected_updated_at` protects against stale operational updates.
- Durable idempotency prevents duplicate submissions and rejects conflicting key reuse. Public-safe tracking history excludes private operator notes and user IDs.
- Human response-plan approval is required; negative citizen feedback flags review rather than automatically reopening an incident.

## Testing

Last verified results documented in [Stage 5 changes](docs/STAGE5_CHANGES.md): **153 backend tests passed** (3 optional live tests skipped), **23 frontend tests passed**, and **48 live Auth/database/storage checks passed**. The live checks used an in-process FastAPI client with real Supabase services and cleaned up disposable data. TypeScript/build and lint checks also passed.

Run from the repository root with the backend environment active:

```text
python -m pytest backend/tests -q
cd frontend
npm test
npm run build
npm run lint
cd ..
git diff --check
```

The frontend build includes TypeScript checking. Browser acceptance, signup/reset email delivery and the Docker image build still require manual verification; automated live checks do not establish those results.

## Deployment

The backend is prepared for **Railway** using `railway.json` and `backend/Dockerfile`; the frontend is prepared for **Vercel** using `frontend/vercel.json`. Deployment has not been performed. Follow [Deployment readiness](docs/DEPLOYMENT_READINESS.md) for build/start commands, environment configuration, health checks, production CORS, Auth redirect URLs and the manual acceptance checklist.

## Current limitations / future work

- WhatsApp/SMS intake and broader offline/low-connectivity support are not implemented.
- Fusion uses basic text similarity, distance, landmarks and time; stronger semantic matching remains future work. Confidence estimates do not establish independent-source validation.
- Audio transcription and AI image corroboration are not implemented.
- Distributed abuse prevention, evidence retention and scheduled orphan cleanup remain pending. Storage and database writes do not share a transaction.
- Some helper copy remains English. Detailed match decisions and location confidence are not currently exposed in the incident UI.
- Vite/esbuild development-tool advisories remain accepted for isolated loopback hackathon development; the last production-only npm audit was clean. A larger frontend bundle and manual deployment acceptance checks remain documented in the readiness guide.

## Team

| Name | Contribution |
| --- | --- |
| Muhammad Furqan Arshad | Team Lead / Integration / Architecture |
| Muhammad Huzaifa Shamas | Frontend Development |
| Ghulam Mohy Ud Din | Backend / AI Integration |
| Muhammad Ali | Civic Logic / Routing Rules |
| Khadeeja Ameen | Testing / Validation |
| Aleeba Pervaiz | QA / System Testing |

## Hackathon

**PakAngel’s Generative AI Hackathon — Final (2nd) Hackathon**

Theme: *Build Intelligent Agents to Reshape the Future, Unlock Potential & Drive Innovation*

Further reading: [Product](docs/PRODUCT.md) · [Backend](backend/README.md) · [Frontend](frontend/README.md) · [Design](docs/DESIGN.md) · [Redesign notes](docs/REDESIGN_NOTES.md) · [Stage 4 changes](docs/STAGE4_CHANGES.md) · [Stage 5 changes](docs/STAGE5_CHANGES.md).
