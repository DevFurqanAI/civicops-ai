# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type aware lint rules:

- Configure the top-level `parserOptions` property like this:

```js
export default tseslint.config({
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

- Replace `tseslint.configs.recommended` to `tseslint.configs.recommendedTypeChecked` or `tseslint.configs.strictTypeChecked`
- Optionally add `...tseslint.configs.stylisticTypeChecked`
- Install [eslint-plugin-react](https://github.com/jsx-eslint/eslint-plugin-react) and update the config:

```js
// eslint.config.js
import react from 'eslint-plugin-react'

export default tseslint.config({
  // Set the react version
  settings: { react: { version: '18.3' } },
  plugins: {
    // Add the react plugin
    react,
  },
  rules: {
    // other rules...
    // Enable its recommended rules
    ...react.configs.recommended.rules,
    ...react.configs['jsx-runtime'].rules,
  },
})
```
# civicops-ai
CivicOps AI - Inclusive Community Incident Intelligence &amp; Response Coordination Platform


## Stage 3: FastAPI integration

Set `VITE_API_URL=http://127.0.0.1:8000` in the local frontend `.env`, then run
`npm run dev`. This URL points to FastAPI; never put Supabase or Groq credentials
in frontend environment variables. Restart Vite after environment changes.

The citizen form submits text, language, optional coordinates and landmark.
A submission UUID is reused for the same normalized draft when retrying within
the current page. Changing the draft starts a new attempt. Reloading the page
does not retain the attempt; there is no offline queue. After success, the real
public report ID opens tracking. Tracking reads the report and optional linked
incident; no history is invented. AI-pending reports display classification pending.

The dashboard reads summary, incident list and selected incident details from
FastAPI. Resolved totals are all-time, not today. Scores remain separate numeric
values and display LOW below 0.40, MEDIUM below 0.70, and HIGH otherwise.
Data refresh is manual; there is no streaming or polling.

Operator actions require authenticated OPERATOR/ADMIN access. Response plans
require human approval. Photos/audio are browser-only previews and are not sent.
The category dropdown is a guide; backend classification uses the submitted text.

Checks: `npm run build` (includes TypeScript checking) and `npm test`.
Adapter tests use Node's built-in runner and native TypeScript stripping (Node
22.6+; verified with Node 24); no additional testing dependencies are installed.


## Stage 4: authentication and persistent operations

Add only the public `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`
variables to the local frontend `.env`. The latter must be an `sb_publishable_`
key. Restart Vite after configuration changes. Backend credentials stay in the
backend environment. Vite rejects server-key variable names and an invalid key
type before building. No existing `.env` values were changed.

Sign-in uses Supabase Auth email/password with session restoration, token refresh
and logout. The SDK manages the local session; FastAPI verifies each Bearer token
through Supabase Auth and loads `profiles.role`. The frontend's trusted role comes
from `GET /api/auth/me`, not signup/JWT metadata. Operator routes wait for session
verification, redirect unauthenticated users to login and deny citizen access.
The operator API now requires OPERATOR/ADMIN even if called outside the UI.

Authenticated reports store reporter_id and use a USER:<verified UUID> idempotency
scope. Public submissions remain supported. Owned reports require the owner or an
operator for tracking; anonymous reports retain their high-entropy public tracking
ID. Signing in does not claim ownership of an anonymous report. Refreshing an
attempt still does not retain its client submission UUID; no offline queue exists.

`GET /api/reports/{public_id}/tracking` provides only safe location/history fields:
old/new status and timestamp, never operator notes, actor IDs or audit details.
The tracking page renders these actual events. Private operational notes can now
be saved by operators as an atomic audit_logs INSERT.

Status, assignment and response-plan approve/modify/reject controls call authenticated
FastAPI endpoints backed by atomic RPCs. Controls show real loading/errors/results
and send the incident version to prevent stale edits. Modified plans require a
separate approval. Eligible owners can submit YES/PARTIALLY/NO feedback for their
linked resolved report. NO/PARTIALLY flag review without automatically reopening.
No media upload, signup UI, password-reset flow, role-promotion endpoint or deployment
was implemented. Live Auth/API/PostgreSQL verification passed; browser interaction
verification has not been completed.

CORS permits localhost:5173 and 127.0.0.1:5173, plus explicit comma-separated
`FRONTEND_ORIGINS` configured on the backend. Bearer auth does not require cookies
or wildcard credentialed CORS.


## Stage 5: citizen accounts and private evidence

The existing login page now includes citizen signup and password-reset requests.
Auth callback/reset routes consume Supabase PKCE codes; confirmation/reset links
must open in the requesting browser. Public signup sends no role metadata.

Signed-in owners can attach images (10 MiB) and voice evidence (15 MiB, five minutes).
Images/audio are validated and normalized by FastAPI, stored privately, and shown
through authenticated evidence reads in tracking/operator details. Failed evidence
upload preserves the stored text report and its real tracking ID. Anonymous text
submission stays available; anonymous local previews are never claimed as uploaded.

Node 24 is the supported test/build runtime. Vite/preview bind to loopback only.
Production builds require VITE_API_URL, VITE_SUPABASE_URL and
VITE_SUPABASE_PUBLISHABLE_KEY. No other frontend environment variables are needed.

[Deployment readiness](../DEPLOYMENT_READINESS.md) documents exact hosting settings,
Auth redirect URLs, the accepted development-tool advisories and all manual browser
checks. Stage 4's account/media deferrals above are historical and superseded here.
