# Stage 5 deployment readiness (nothing deployed)

The implementation is ready for local acceptance checks. Production activation
still requires the manual checklist below and explicit deployment approval.
Existing reports/incidents and Stage 4 transaction RPCs are unchanged.

## Media architecture and limits

- Private Supabase Storage bucket: `report-evidence`. It has been provisioned and
  verified private, with a 15 MiB object limit and only normalized JPEG/WebM MIME
  types accepted by Storage. No public object URLs are stored or returned.
- Browser sends raw file bytes to authenticated FastAPI. POST
  `/api/reports/{public_id}/media?upload_id=<retry UUID>&filename=<original name>`.
  The filename is validated but never used as an object path. Server derives a
  report-scoped UUID and stores `<report UUID>/<media UUID>.jpg` or `.webm`.
- JPEG/PNG/WebP: up to 10 MiB, single frame, at most 12 million pixels. Pillow
  decodes content, checks actual format against MIME/extension, corrects orientation
  and re-encodes JPEG without EXIF/GPS or other source metadata.
- WebM, MP4/M4A, MPEG/MP3 and WAV: up to 15 MiB and five minutes. Magic bytes,
  ffprobe container/stream checks and full FFmpeg decode validate content. Audio-only
  streams normalize to mono WebM/Opus with source metadata stripped. No transcription
  or AI image corroboration is claimed.
- `report_media`: id, report_id, IMAGE/AUDIO, storage_path, normalized mime_type,
  SHA-256 of stored content, safe size/dimension/duration metadata and input hash.
  OTHER is reserved; there is no arbitrary attachment uploader.
- Only a signed-in report owner can upload. Owners and trusted operators/admins
  can fetch evidence through FastAPI. Anonymous text-only submission still works;
  anonymous previews are not uploaded and anonymous reports cannot be claimed later.
- GET `/api/reports/{public_id}/media` lists safe metadata. GET
  `/api/reports/{public_id}/media/{media_id}` returns protected bytes with no-store.
  GET `/api/incidents/{incident_id}/media` lists linked evidence for operators only.
  Tracking and dashboard use those endpoints and temporary browser blob previews.
- Upload UUIDs survive same-file retries while the page is open. Report persistence
  happens first; failed media never rolls back a text report. The UI shows its real
  tracking ID and can retry the unchanged report/file without duplicating metadata.
- Storage and PostgreSQL cannot share a transaction. On uncertain metadata failure
  the private object is retained so retries can reconcile it. An abandoned upload
  may leave an orphan; no scheduled orphan cleaner/retention policy is implemented.
  Inspect objects against report_media through trusted tooling before deleting any.
- Two concurrent media jobs per backend process; busy requests return 429 with
  Retry-After. This is a resource bound, not distributed per-user rate limiting.

For another environment run from the repository root:
`python -m backend.tools.prepare_storage`.
The script creates/updates only this private bucket, not database schema/RLS.
It refuses to proceed if the existing bucket is public. Do not add broad anon or
 authenticated storage.objects policies; browser Storage access is unnecessary.
Inspect Supabase Storage/RLS advisors before public activation. Live citizen
object-list/download checks confirmed direct access is currently denied.

## Citizen accounts

Login retains the existing design with citizen signup and forgot-password modes.
Signup sends email/password and a confirmation redirect only, never role metadata.
The existing trusted trigger creates CITIZEN; there is no public promotion path.
FastAPI still verifies tokens and loads profiles.role for authorization.

Email confirmation: `/auth/callback`. Password recovery: `/auth/reset`.
Supabase PKCE codes are exchanged once and removed from the address bar. Links
must open in the browser that requested them. Invalid/expired links show a fixed
safe error. New passwords require at least 12 characters and matching confirmation.
Successful reset signs out and asks the user to sign in again. Reset-request copy
never reveals whether an account exists. Provider errors are not printed.

Enable email confirmation and configure a working SMTP provider in Supabase Auth
before public use. Configure SMTP/rate limits/CAPTCHA as appropriate for real traffic;
the application does not implement a separate distributed abuse-prevention service.
Public signup/email delivery/reset completion require the browser checklist below.

## Configuration

Frontend accepts only public environment variables:

| Variable | Value |
| --- | --- |
| VITE_API_URL | Actual Railway HTTPS API origin, without /api suffix |
| VITE_SUPABASE_URL | Actual Supabase project URL |
| VITE_SUPABASE_PUBLISHABLE_KEY | sb_publishable_ key only |
| VITE_MAPTILER_API_KEY | Browser MapTiler Cloud key for Streets raster tiles; restrict allowed origins |

Production builds require all three. There are no hardcoded production URLs.
Frontend .env.example lists the correct supported variables. Vite rejects server-key
variable names and non-publishable Auth keys. Restart Vite after local env changes.

Backend:

| Variable | Value |
| --- | --- |
| APP_ENV | production on Railway; development locally |
| SUPABASE_URL | Supabase project HTTPS URL |
| SUPABASE_SECRET_KEY | Server secret, Railway backend service only |
| GROQ_API_KEY | Server Groq key, Railway backend service only |
| LLM_MODEL | Verified available structured-output Groq model |
| FRONTEND_ORIGINS | Exact production frontend HTTPS origin(s), comma-separated; no paths/trailing slash/wildcard |
| PORT | Provided by Railway; default 8000 only for local container |

Production startup fails safely for missing configuration or invalid HTTPS origins,
reporting variable names rather than values. Local localhost:5173/127.0.0.1:5173 CORS
remains supported. Credentials are false; Bearer auth needs no credentialed wildcard.
Do not put backend secrets in Vercel, frontend variables, files or build arguments.
Docker context excludes all .env files, virtual environments, git and frontend data.

## Dependency review

Vite 5.4.21 is the latest Vite 5 patch; patched releases for the current Vite
advisories start at later major lines. No major-version upgrade was performed.
The remaining findings concern Vite development-server file disclosure/path handling,
Windows launch-editor handling and esbuild development-server cross-origin access.
Their code is build/development tooling, not bundled into the deployed static client.
The production-only npm audit reports zero vulnerabilities.

These remain accepted only for isolated loopback hackathon development. Vite and
preview explicitly bind 127.0.0.1; do not use --host to expose them, and do not run
Vite/preview as a production server. An esbuild-only override would not resolve the
Vite findings and could violate Vite's tested dependency range. Before exposing dev
tooling or maintaining the project beyond the hackathon, plan a reviewed Vite upgrade.

Official advisory references:
- https://github.com/vitejs/vite/security/advisories/GHSA-fx2h-pf6j-xcff
- https://github.com/vitejs/vite/security/advisories/GHSA-4w7w-66w2-5vf9
- https://github.com/vitejs/vite/security/advisories/GHSA-v6wh-96g9-6wx3
- https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99

The frontend still has the build's large-chunk advisory. It is not a failed build.
Backend pinned dependencies and Docker base/FFmpeg should be scanned in the intended
hosting pipeline before internet exposure; no image vulnerability scan was performed.

## Exact Railway setup (after approval)

1. Connect this repository to a Railway backend service. Keep repository root `/`;
   do not set its root directory to backend. `railway.json` uses `backend/Dockerfile`.
2. Docker build installs Python 3.12 dependencies and FFmpeg, copies only the backend,
   and runs as a non-root user. Equivalent build command from repository root:
   `docker build -f backend/Dockerfile -t civicops-backend .`.
3. Set backend variables from the table using Railway's secret/environment editor.
   Never paste values into repository files. Set APP_ENV=production.
4. Start command supplied by the Dockerfile:
   `uvicorn backend.main:app --host 0.0.0.0 --port $PORT --no-access-log --limit-concurrency 32 --timeout-keep-alive 5`.
   Railway supplies PORT. The shell expands it; no reload/dev mode.
5. Generate the backend HTTPS domain when deployment is approved. Health check is
   `/health`, timeout 60 seconds. This checks running application startup, not every
   cloud dependency; run a real report/auth/storage smoke check separately.
6. Set FRONTEND_ORIGINS to the exact final Vercel HTTPS origin. If multiple preview
   environments are needed, enumerate trusted origins explicitly; never use `*`.
7. Size Railway memory for image decoding/FFmpeg and the two simultaneous upload jobs.
   Start with at least 1 GiB and measure usage. Configure spend/storage quotas and
   edge/request rate limits before broad public traffic. Do not increase worker count
   without reviewing per-process resource limits.

## Exact Vercel setup (after approval)

1. Import the same repository and set Root Directory to `frontend`.
2. Framework: Vite; Node.js: 24.x. Install: `npm ci`; Build: `npm run build`;
   Output Directory: `dist`. frontend/vercel.json supplies SPA rewrites/security headers.
3. Configure the four public frontend variables above. VITE_API_URL is the
   backend HTTPS domain; it does not point directly to Supabase protected tables.
   Set VITE_MAPTILER_API_KEY under Project Settings > Environment Variables for
   Production and any Preview environments you use. In MapTiler Cloud, authorize
   the actual Vercel/custom-domain origins (and localhost for development).
   Redeploy after changing the variable: Vite embeds it at build time. Without it,
   the map displays a configuration message and makes no raster tile requests.
   Both dashboards use the shared Leaflet map with the documented 256px Streets
   raster URL: https://api.maptiler.com/maps/streets-v4/256/{z}/{x}/{y}.png?key=<key>.
   See https://docs.maptiler.com/leaflet/examples/raster-tiles-in-leaflet-js/.
4. Supabase Dashboard > Authentication > URL Configuration: set Site URL to the
   actual final frontend HTTPS origin. Add exact redirect URLs:
   `<frontend origin>/auth/callback` and `<frontend origin>/auth/reset`.
   For local checks also add `http://localhost:5173/auth/callback`,
   `http://localhost:5173/auth/reset`, `http://127.0.0.1:5173/auth/callback`,
   `http://127.0.0.1:5173/auth/reset`. Use one origin consistently for PKCE.
5. Check email confirmation/SMTP and trusted operator provisioning. Keep promotion
   outside public signup. Apply the existing Stage 4 RPC script if this is a new
   Supabase environment, then provision the private evidence bucket.
6. After approval deploy the backend/frontend and run the checklist below against
   final URLs. Deep-link /track and auth callbacks must survive a browser refresh.

Official hosting references:
https://docs.railway.com/guides/fastapi
https://vercel.com/docs/frameworks/frontend/vite

## Manual local browser acceptance checklist

Browser automation could not initialize because the runtime reports missing
`sandboxPolicy` metadata. No browser success is claimed. Run locally:
backend: `backend/.venv/Scripts/python.exe -m uvicorn backend.main:app --reload`
frontend (in frontend/): `npm ci`, then `npm run dev`.
Use http://127.0.0.1:5173 consistently and configure its two Auth redirect URLs.
Use disposable citizen/operator accounts, never share passwords or access tokens.

1. Create citizen account; confirm email in the same browser. Verify its profile
   remains CITIZEN. An attempted signup metadata role must not change that role.
2. Login, refresh the page to restore the session, logout and login again. Citizen
   operator-dashboard access must be denied. Invalid credentials show safe errors.
3. Request password reset. Verify generic confirmation, receive link, set matching
   12+ character password, then sign in with the new password. Test an expired link.
4. Submit signed-in text/location report with JPEG/PNG/WebP evidence. Track the real
   returned ID and view its stored image after refresh. Repeat with recorded WebM
   voice and a WAV/MP3/M4A file (supported codecs); view/play actual saved evidence.
5. Try wrong MIME/extension, corrupt files, >10 MiB images, >15 MiB audio, video and
   >5-minute audio. They must fail without losing the stored text report. Retry an
   unchanged upload after a connection interruption; metadata must not duplicate.
6. Sign out: anonymous text-only report still submits. Its local media previews
   must not be represented as uploaded. Another citizen cannot access owned evidence.
7. Sign in with a trusted operator account. Check dashboard/filter/map/details and
   actual linked evidence. Assign department, modify/save plan, separately approve it.
8. Progress RECEIVED -> VERIFIED -> ASSIGNED -> IN_PROGRESS -> RESOLVED. Invalid jumps
   must fail; IN_PROGRESS needs approval. Assignment/history/audits must persist.
9. As report owner, refresh tracking and verify actual timeline without private notes.
   Submit YES/PARTIALLY/NO once; duplicates/unrelated feedback must fail. NO must not
   automatically reopen the incident.
10. Verify backend-unavailable and upload errors, text-only operation, refresh/deep
    links and both desktop/mobile layout. Repeat after final production configuration.

No deployment has been attempted. Browser/email checks, hosting image execution,
production configuration and abuse/retention policy review remain acceptance items.
