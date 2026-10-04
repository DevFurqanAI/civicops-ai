# CivicOps AI deployment readiness

Repository configuration targets Railway + Vercel, Supabase and MapTiler. This guide does not certify live hosting, SQL activation, email delivery or browser acceptance. No deployment is performed by documentation synchronization.

## Prerequisites and SQL order

1. Use an existing compatible Supabase base schema: the ten tables, department seeds, RLS policies and citizen-only Auth profile trigger. The repository does not supply a complete base bootstrap.
2. Inspect schema/RPC state. For the pre-department base, apply current department_portal.sql once as owner. An already migrated environment must not rerun it.
3. For an older department installation missing the release wrapper, apply only department_assignment_release.sql. The latest full migration already includes it.
4. Do not apply historical stage4_operations.sql after the current migration.
5. Verify service_role-only RPC grants, browser profile-write denial, citizen signup and active membership restrictions. See [SQL guide](../backend/sql/README.md).
6. Provision/verify private storage with python -m backend.tools.prepare_storage from the repository root. It refuses an existing public bucket.
7. Provision Operator/Admin/Department accounts through trusted profile updates, never signup metadata.

There is no migration ledger or SQL connection in the repository proving live application state; check the destination before changes.

## Environment placement

| Location | Variable | Purpose |
| --- | --- | --- |
| Backend only | SUPABASE_URL | Supabase project HTTPS URL |
| Backend only | SUPABASE_SECRET_KEY | Server secret; never Vercel/client code |
| Backend only | GROQ_API_KEY | Groq credential |
| Backend only | LLM_MODEL | Available model compatible with the implemented structured-output path |
| Backend only | APP_ENV | production on hosting; development locally |
| Backend only | FRONTEND_ORIGINS | Exact trusted HTTPS frontend origins, comma-separated, no path/wildcard/trailing slash |
| Railway | PORT | Hosting-provided port; Docker local default 8000 |
| Frontend build | VITE_API_URL | FastAPI HTTPS origin, no /api suffix |
| Frontend build | VITE_SUPABASE_URL | Public project URL |
| Frontend build | VITE_SUPABASE_PUBLISHABLE_KEY | sb_publishable_ browser key |
| Frontend build | VITE_MAPTILER_API_KEY | Browser raster-map key; restrict intended origins |

Production backend validates required variables and HTTPS origins, printing names rather than secret values. Startup always requires Supabase URL/secret. Development can persist pending intake without usable Groq.

Production frontend builds require the three API/Auth variables. MapTiler key is not a build requirement: missing it renders a clear basemap fallback with no raster requests. Set all four for working maps.

VITE_ values are compiled into assets: rebuild/redeploy after changes. Restart backend after server environment changes. Vite rejects server-key variable names/non-publishable Auth keys; do not treat that as permission to store secrets elsewhere in frontend files.

CORS explicitly allows localhost:5173 and 127.0.0.1:5173 plus configured origins. allow_credentials=false; bearer auth does not require wildcard credentialed CORS. Enumerate trusted preview origins rather than broad wildcards.

## Railway backend

1. Connect the repository; keep service root at repository root, not backend/.
2. railway.json selects backend/Dockerfile with root build context.
3. Docker installs Python 3.12 requirements and FFmpeg, copies backend, and runs as a non-root user. .dockerignore excludes environment files, virtual environments, tests, Git and frontend.
4. Configure backend variables through Railway's environment editor; set APP_ENV=production.
5. Docker start command:
   `uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000} --no-access-log --limit-concurrency 32 --timeout-keep-alive 5`.
6. Health check /health, timeout 60 seconds; restart ON_FAILURE up to three retries. Health is liveness, not an Auth/database/Groq/Storage probe.
7. Configure the final Vercel/custom HTTPS origin in FRONTEND_ORIGINS. Restart after changes.
8. Validate image execution, memory under image/audio load, quotas and edge/request controls before broader traffic. Media has two processing slots per process; multi-process deployment does not create distributed limits.

Equivalent local image build, when Docker is available:

```sh
docker build -f backend/Dockerfile -t civicops-backend .
```

## Vercel frontend

1. Import repository; Root Directory frontend.
2. Framework Vite; Node.js 24.x.
3. Install npm ci; build npm run build; output dist.
4. Set all four frontend variables for Production and intended Preview environments.
5. frontend/vercel.json supplies SPA rewrites and nosniff/no-referrer/frame-denial headers. Deep links must refresh correctly.
6. In MapTiler Cloud restrict the browser key to intended local/hosted origins, then verify tile requests in the deployed browser under the actual headers. The repository alone cannot prove a restricted key works.
7. Redeploy after changing any VITE_ variable.

Shared raster URL:

```text
https://api.maptiler.com/maps/streets-v4/256/{z}/{x}/{y}.png?key=<encoded-browser-key>
```

Leaflet uses 256px XYZ tiles, zoomOffset 0, minZoom 1, crossOrigin true. Attribution includes MapTiler and OpenStreetMap contributors. Direct public OSM raster tiles are not the current provider.

## Supabase Auth redirects and email

Set Site URL to the actual frontend origin. Add exact redirects:

```text
https://YOUR_FRONTEND/auth/callback
https://YOUR_FRONTEND/auth/reset
http://127.0.0.1:5173/auth/callback
http://127.0.0.1:5173/auth/reset
http://localhost:5173/auth/callback
http://localhost:5173/auth/reset
```

Use one origin/browser consistently for PKCE links. Enable confirmation and configure working email delivery/SMTP, provider rate limits and abuse controls before public use. Signup has no role metadata and the trusted trigger creates CITIZEN. Password reset uses generic account-existence copy, 12-character minimum, matching confirmation and signout after success. Provider configuration/email delivery are separate manual checks.

## Private evidence

Bucket report-evidence must remain private. Server uploads normalize JPEG/PNG/WebP <=10 MiB, single frame <=12 million pixels to JPEG without source metadata. Supported audio <=15 MiB, <=5 minutes, one audio-only stream normalizes to mono WebM/Opus using FFmpeg/ffprobe.

Bucket allows normalized image/jpeg and audio/webm with 15 MiB object limit. report_media stores private paths/hashes, not public URLs. FastAPI checks owner upload and owner/Operator/Admin/assigned-Department reads. No broad browser storage.objects policies are needed.

Two concurrent processing jobs per process return 429/Retry-After when busy. This is a resource limit, not per-user/distributed rate limiting. Report persistence happens before media; failed upload retains the text report. Uncertain metadata failures retain objects for retry reconciliation; abandoned objects need trusted manual review. No scheduled retention/orphan cleaner is installed.

## Dependencies and readiness limits

The checked-in lockfile/build uses Vite 5.4.21. Historical Stage 5 review accepted Vite/esbuild development-server advisories only for isolated loopback hackathon tooling and recorded a clean production-only npm audit at that time. Those are historical results, not a current security guarantee or a claim that no newer advisory exists.

Recheck at release time:

```powershell
npm audit
npm audit --omit=dev
```

Do not expose Vite/preview as production servers. A reviewed tooling upgrade, dependency/container scan and public-traffic abuse/retention policies remain release work. Build currently warns about a large frontend chunk; it is not a build failure. No image vulnerability scan or deployment certification is implied.

## Acceptance before presentation/public release

Run [test commands and the full role-aware browser demo](TESTING.md). Verify signup/reset delivery, auth identity switching, manual/GPS locations, private image/audio, map tiles, Operator review/release, Department work, final Operator verification and feedback. Test stale conflicts and reassignment revocation.

Browser automation was unavailable in earlier implementation checks because of runtime sandboxPolicy initialization failure. Recorded live in-process checks do not establish browser acceptance. Hosting status, actual origin/key restrictions, SQL grants and cloud configuration must be verified in the destination environment.
