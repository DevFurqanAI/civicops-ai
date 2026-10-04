# CivicOps AI frontend

React 18, TypeScript, Vite 5 and Tailwind CSS 4. Real FastAPI adapters, Supabase Auth and a shared Leaflet/React Leaflet map power citizen, operator and department portals.

## Setup

Node.js 24.x, from frontend/:

```powershell
npm ci
npm run dev
```

Copy .env.example to .env only if absent. Use VITE_API_URL, VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY and VITE_MAPTILER_API_KEY. The Auth key must begin sb_publishable_. Never use SUPABASE_SECRET_KEY, service-role keys or Groq secrets in Vite. Production builds require the three API/Auth variables; raster maps additionally need the MapTiler key. Restart Vite after changes; production VITE_ changes require rebuild/redeploy.

## Routes

| Route | Component / access |
| --- | --- |
| / | CitizenReportPage; public reporting |
| /track | TrackLookupPage; tracking ID lookup |
| /track/:id | ReportTrackingPage; backend enforces report access |
| /login | LoginPage; login/signup/reset request |
| /auth/callback | AuthCallbackPage; PKCE confirmation |
| /auth/reset | AuthCallbackPage reset mode |
| /operator/dashboard | OperationsDashboard; OPERATOR/ADMIN only |
| /department/dashboard | DepartmentDashboard; DEPARTMENT with trusted membership |

Admin uses the Operator dashboard. There is no generic non-citizen privilege or public promotion UI.

## Source organization and behavior

services/api.ts owns HTTP requests, bearer attachment, payload mapping and incident/report adapters. auth/ and services/session.ts maintain trusted identity from /api/auth/me. Supabase handles automatic token refresh. Initial/concurrent verification deduplicates; repeated tab-focus/same-identity events/routes do not blank verified UI. Different identity/signout clears old roles. Trusted promotion may require reload/relogin for display; server checks remain fresh.

Citizen workflow is description → optional manual landmark/GPS → optional photo/voice → submit. UI ru maps to roman_urdu. GPS does not overwrite landmarks; no-location reports remain allowed. Attempt UUIDs survive same-draft retries while the page lives, not refresh/offline synchronization. Anonymous evidence previews are local only; signed-in owners upload after text persistence. Failure preserves the real tracking ID.

Tracking shows safe recorded history and text location, never fabricated timeline entries. Final RESOLVED plus owned linked report enables eligible feedback.

Operator queue uses real summary/incidents/details, local scope/category/priority filters, plan review, Assign & Release, notes and completion verification. Department summary derives only from its authorized queue, with combined status/priority/category/search filters and backend-allowed actions. Refresh is manual.

Evidence-confidence/spam-risk display bands are LOW <.40, MEDIUM <.70, HIGH otherwise, independently.

## Shared maps

components/IncidentMap.tsx is used once per dashboard. Leaflet CSS/container sizing, selection highlighting/popups and resize/focus helpers are shared. Raster source is MapTiler Streets-v4:

```text
https://api.maptiler.com/maps/streets-v4/256/{z}/{x}/{y}.png?key=<encoded-browser-key>
```

Attribution includes MapTiler and OpenStreetMap contributors. There is no direct public OSM raster layer. Missing key shows configuration fallback without broken tile requests; list/detail/text locations remain usable. Invalid/null coordinates omit markers. Operator markers reflect filtered incidents; Department markers show all authorized queue rows. Selecting a locally filtered-out Department marker clears filters to reveal it.

## Checks and deployment

```powershell
npm test
npm run build
npm run lint
```

Build runs tsc -b and Vite. Tests use Node's native runner/type stripping with selected shared-component rendering and Leaflet mocks; they are not live-browser tile tests.

See [design](../docs/DESIGN.md), [testing/demo](../docs/TESTING.md), [API](../docs/API_CONTRACT.md) and [Vercel/Auth setup](../docs/DEPLOYMENT_READINESS.md). Full helper-copy translation, browser visual acceptance, offline sync and notification services remain outside implemented scope.
