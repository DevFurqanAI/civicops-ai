# Citizen portal and command-center redesign

Visual/UX change only. Backend, API field contracts, authentication architecture,
persistence, incident fusion, media processing and operational actions are unchanged.
No mock data, fabricated evidence or simulated action results were added. No deployment.

## What changed

- Navy/slate foundation with teal actions and consistent typography, spacing and
  panel/control styling. Red marks critical/error, amber high priority/warnings,
  green resolved/success. Primary contrast pairs were calculated to meet WCAG AA.
- Shared navigation for Report issue, Track report and real account/session controls.
  A tracking-ID entry route now navigates to the existing protected/public-safe read.
- Citizen form: description, landmark/location, optional photo/voice, submission.
  Category selector removed. Wide desktop form/guidance composition stacks on mobile.
  English/Urdu/Roman Urdu selection stays visible; Urdu form direction is RTL.
  Anonymous text reporting and local-preview/private-upload distinctions remain clear.
- Compact dashboard summary; incident queue and persistent intelligence panel share
  primary desktop space. A short map supports the queue instead of dominating it.
  Active/all scope is a local status filter; existing priority/category filters remain.
- Queue rows include actual priority/title/summary/category/report count/location,
  status/current department and update time. Time explicitly means updated_at.
- Intelligence displays actual AI summary, linked count, separate confidence/risk
  estimates, location, department/status, supporting signals and private evidence.
  AI recommendation/review/decision flow and human approval states are localized
  within response-plan review. Existing mutation/loading/error handlers are preserved.
- Deliberate empty states for queue, map coordinates, tracking history and evidence.
  Shared keyboard focus, skip navigation, native controls, associated labels,
  reduced-motion handling and mobile detail focus/scroll behavior.
- Login, signup/reset and tracking use the same visual identity. Brand page title
  replaces the Vite starter title; no auth or account operation was changed.

## Changed files

Modified:
- frontend/index.html
- frontend/src/index.css
- frontend/src/App.tsx
- frontend/src/pages/CitizenReportPage.tsx
- frontend/src/pages/OperationsDashboard.tsx
- frontend/src/pages/ReportTrackingPage.tsx
- frontend/src/pages/LoginPage.tsx
- frontend/src/pages/AuthCallbackPage.tsx
- frontend/src/components/SessionControls.tsx
- frontend/src/components/ReportEvidence.tsx

Created:
- PRODUCT.md
- frontend/DESIGN.md
- frontend/src/components/AppHeader.tsx
- frontend/src/components/EmptyState.tsx
- frontend/src/pages/TrackLookupPage.tsx
- frontend/src/utils/presentation.ts
- frontend/REDESIGN_NOTES.md

Earlier-stage working-tree changes are separate from this list.

## Verification and limitations

- TypeScript/production build, frontend ESLint and 23 frontend tests passed.
- Backend regression: 153 passed, 3 optional live tests skipped.
- git diff --check passed. Existing large-bundle advisory remains.
- Browser runtime initialization fails on missing sandboxPolicy metadata. No visual
  screenshot or real browser interaction pass is claimed. Check locally at desktop
  widths 1440/1024 and mobile 390/320, keyboard navigation, zoom, long incident titles,
  Urdu layout, empty states and authenticated status/assignment/plan/feedback actions.
- Full helper-copy translation remains incomplete; primary report-language input
  and backend language mapping are preserved. Some instructions remain English.
- Incident API does not expose location confidence or per-link match decisions.
  The UI renders supporting signals truthfully and states those missing details;
  it does not infer grouping rationale from a shared category or claim corroboration.
- Tracking history is safe status history, not private operator notes. Timestamps
  are update times, not invented creation/submission dates. Data refresh is manual.
