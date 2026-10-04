# Stage 4 completion and changed files

Stage 4 authentication and persistent operational actions are implemented.
The user applied the SQL functions and configured public frontend Auth credentials.
No media upload, deployment or UI redesign was performed.

## Behavior and contracts

- Supabase Auth handles email/password login, session restoration/refresh and logout.
  FastAPI verifies tokens through Auth and loads trusted profiles.role each request.
  Missing/invalid tokens fail closed; frontend roles/metadata are never trusted.
- OPERATOR/ADMIN can read operations and change status, assign seeded departments,
  review plans and save private notes. CITIZEN cannot mutate incidents.
- Status, assignment, plan review and feedback use server-only atomic RPCs.
  Assignment closes prior active assignments without deleting history.
  Central status rules forbid arbitrary jumps; IN_PROGRESS requires human approval.
- Owned reports use per-user idempotency. Public anonymous submissions remain.
  Tracking shows real history without private notes, actor IDs or audit metadata.
- Eligible citizens can give one YES/PARTIALLY/NO response for an owned linked report
  on a resolved incident. Negative/partial feedback flags review, never auto-reopens.
- Incident responses add updated_at; operational requests accept expected_updated_at
  for optimistic concurrency. Existing response fields remain. /api/auth/me replaces
  fake login. Operations reads now require OPERATOR/ADMIN access.
- CORS explicitly allows local frontend origins plus configured FRONTEND_ORIGINS.

## Files modified/created in Stage 4

Modified:
- backend/main.py
- backend/models/user.py
- backend/models/report.py
- backend/models/incident.py
- backend/routes/auth.py
- backend/routes/dashboard.py
- backend/routes/reports.py
- backend/routes/incidents.py
- backend/routes/feedback.py
- backend/tests/test_reports.py
- backend/tests/test_incidents.py
- backend/repositories/incidents.py
- backend/services/incident_adapter.py
- backend/README.md
- frontend/.env.example
- frontend/package.json
- frontend/package-lock.json
- frontend/vite.config.ts
- frontend/src/App.tsx
- frontend/src/services/api.ts
- frontend/src/pages/LoginPage.tsx
- frontend/src/pages/CitizenReportPage.tsx
- frontend/src/pages/ReportTrackingPage.tsx
- frontend/src/pages/OperationsDashboard.tsx
- frontend/README.md
- frontend/tests/api.test.ts

Created:
- backend/auth.py
- backend/services/operations.py
- backend/sql/stage4_operations.sql
- backend/sql/render_status_policy.py
- backend/sql/README.md
- backend/tests/test_auth.py
- backend/tests/test_stage4_sql.py
- backend/tests/live_stage4.py
- backend/STAGE4_CHANGES.md
- frontend/src/services/auth.ts
- frontend/src/services/session.ts
- frontend/src/auth/AuthProvider.tsx
- frontend/src/auth/context.ts
- frontend/src/auth/useAuth.ts
- frontend/src/auth/ProtectedOperatorRoute.tsx
- frontend/src/components/SessionControls.tsx
- frontend/tests/session.test.ts

No tables, RLS policies or signup triggers were redesigned. The existing trigger
forces CITIZEN signup and existing profile policies prevent citizen role changes.
Disposable verification accounts were promoted only by trusted server credentials
and removed afterward. Earlier-stage working-tree changes are outside this list.

## Verification and remaining limitations

- Backend: 130 passed, 3 optional live tests skipped.
- Frontend: 19 tests passed; TypeScript/build and ESLint passed.
- git diff --check passed; generated assets exclude backend Supabase/Groq secrets.
- Live Auth/FastAPI/PostgreSQL: 35 checks passed, including authorization, durable
  histories, plan reviews, stale versions, linked feedback and RPC grants. Disposable
  accounts and records were removed. FastAPI ran in-process with real cloud services;
  this does not establish browser interaction coverage or deployment readiness.
- Deterministic tests verify transaction rollback after injected audit failure.
- Media, offline queueing, signup/reset UI, role-promotion UI and automated review
  workers remain deferred. Anonymous reports cannot receive ownership feedback.
- Before deployment: review existing Vite/esbuild development dependency advisories,
  production HTTPS/origins/Auth configuration and trusted operator provisioning.
  The build also reports its existing large-chunk advisory. No Stage 5 work started.
