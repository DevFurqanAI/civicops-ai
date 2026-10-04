# Stage 5 changes and verification

Media/storage, citizen account UI and deployment configuration are implemented.
No application deployment or database schema/RLS change was performed. The private
report-evidence bucket was provisioned and live-tested. Existing report/incident
response contracts remain; media endpoints are additive.

## Files modified

- backend/main.py
- backend/requirements.txt
- backend/.env.example
- backend/README.md
- frontend/.env.example
- frontend/package.json
- frontend/package-lock.json
- frontend/vite.config.ts
- frontend/src/App.tsx
- frontend/src/services/auth.ts
- frontend/src/services/api.ts
- frontend/src/pages/LoginPage.tsx
- frontend/src/pages/CitizenReportPage.tsx
- frontend/src/pages/ReportTrackingPage.tsx
- frontend/src/pages/OperationsDashboard.tsx
- frontend/tests/api.test.ts
- frontend/README.md

## Files created

- .dockerignore
- railway.json
- DEPLOYMENT_READINESS.md
- backend/Dockerfile
- backend/config.py
- backend/routes/media.py
- backend/services/evidence.py
- backend/tools/prepare_storage.py
- backend/tests/test_media.py
- backend/tests/test_config.py
- backend/tests/live_stage5.py
- backend/STAGE5_CHANGES.md
- frontend/vercel.json
- frontend/src/services/accounts.ts
- frontend/src/pages/AuthCallbackPage.tsx
- frontend/src/components/ReportEvidence.tsx
- frontend/tests/accounts.test.ts

Earlier-stage dirty working-tree changes are outside this Stage 5 list. Existing
secret values/.env files were never modified, printed or committed.

## Checks and limitations

- Backend suite: 153 passed, 3 optional live tests skipped.
- Frontend: 23 tests passed; TypeScript/production build and ESLint passed.
- git diff --check passed. Backend secrets are excluded from generated assets.
- Live FastAPI + real Supabase Auth/PostgreSQL/Storage: 48 checks passed, including
  image/audio normalization, media persistence/replay, owner/operator access,
  denial of direct citizen Storage access and the full operational feedback flow.
  Disposable objects, records and accounts were removed afterward.
- Live verification uses an in-process FastAPI client, not browser automation.
  Public email signup/confirmation/password-reset delivery need manual acceptance.
  Browser tooling is blocked by missing sandboxPolicy runtime metadata.
- Docker is unavailable locally, so the hosting image has not been built/run here.
  Dockerfile configuration is prepared; validate it before production activation.
- Production-only npm audit is clean. Vite/esbuild development advisories remain
  accepted only for isolated loopback hackathon development; there is no patched
  Vite 5 release, and a major tooling upgrade was deferred. No npm audit fix --force.
- Large frontend bundle advisory remains. Offline queuing, evidence retention/orphan
  cleanup, distributed abuse prevention and automatic feedback review are not implemented.

See [DEPLOYMENT_READINESS.md](../DEPLOYMENT_READINESS.md) for architecture, limits,
exact Railway/Vercel steps, environment values to supply and browser checklist.
Stopped before application deployment.
