# CivicOps AI testing and demo verification

## Local checks

Python 3.12 and installed backend requirements; Node.js 24.x with npm ci in frontend/.

From repository root:

```powershell
backend/.venv/Scripts/python.exe -m pytest backend/tests -q
Push-Location frontend
npm test
npm run build
npm run lint
Pop-Location
git diff --check
```

Build includes tsc -b. For TypeScript alone, from frontend/: npx tsc -b.

Documentation synchronization check on 2026-10-04: **190 backend tests passed, 3 optional live-AI tests skipped; 58 frontend tests passed; TypeScript/production build and lint passed.** The build retains a >500 kB chunk warning; backend tests report dependency deprecation warnings. Live cloud verifiers and browser acceptance were not rerun for this documentation task. Prefer fresh commands over treating this snapshot as permanent test totals.

## Coverage and evidence boundaries

| Area | Current coverage |
| --- | --- |
| Reports | Create/retrieve, durable replay/conflicts, uniqueness, process restart, schema-safe insert/error diagnostics |
| Intake | Allowed-category schema, multilingual examples, invalid output/failure pending, sanitized diagnostics |
| Fusion | Clear/uncertain matches, distance/category/time/landmark guards, unique links, counts/audits, partial retry repair, state-preserving aggregation |
| Auth | Missing/invalid/expired token, trusted profiles rather than metadata, owned/public reads, explicit role isolation |
| Operations | Valid/invalid actor transitions, plan/note gates, stale versions, assignment history and simulated transaction rollback |
| Department | Membership/active assignment isolation, forged/other-department denial, release, work/completion, reassignment/evidence revocation |
| Media | Owner upload/read rules, private bucket, spoof/size/content/metadata validation, replay, slot bounds and metadata failure recovery |
| Feedback | Owner/link/duplicate checks; blocked before final resolution and eligible afterward |
| Frontend | API adapters/errors, signup/reset metadata, session dedup/account switching, roles, department identity/filters/counts, location and shared-map behavior |
| Configuration | Production required variables/HTTPS origins, SQL source/grant/policy alignment |

Backend tests use real Supabase SDK query construction with deterministic disk-backed transport and Auth/Storage doubles. Process-restart tests demonstrate persistence across interpreters against that test store, not a live Supabase run. RPC behavior is modeled; SQL contract tests read function source. They do not execute actual PostgreSQL locks/grants/functions.

Frontend uses Node's built-in runner/type stripping, API/session mocks and selected real-component rendering with mocked Leaflet DOM primitives. Map tests do not prove live raster downloads, browser focus behavior or full dashboard interaction.

## Optional live checks

Live Groq classification tests are skipped unless CIVICOPS_RUN_LIVE_AI_TESTS=1 and usable GROQ_API_KEY are configured. They consume provider requests; do not print credentials.

Opt-in scripts, from repository root:

```powershell
backend/.venv/Scripts/python.exe backend/tests/live_stage4.py
backend/.venv/Scripts/python.exe backend/tests/live_stage5.py
```

These require the current destination schema/RPCs, Auth and private Storage configuration. They create disposable accounts/records/objects using trusted credentials and remove their own data. They do not execute SQL migrations and are not ordinary pytest tests. Review them before running on a live project. Historical passing results do not certify the present cloud environment.

## Manual browser/demo flow

Use configured disposable Citizen, Operator/Admin and two distinct Department accounts. Do not publish account credentials or production personal data.

1. Sign up a Citizen, confirm email in the requesting browser, login/logout, restore session and test password reset. Verify role stays CITIZEN even with attempted metadata escalation.
2. Switch browser tabs/routes: verified UI should not flicker or repeatedly call /api/auth/me. Test token refresh and account switching; the old role must disappear.
3. Submit English/Urdu/Roman Urdu text. Test manual-only landmark, GPS-only, manual + GPS, blank and no location. Confirm typed landmark is preserved independently.
4. Submit anonymous text: store/track actual ID without claiming evidence or ownership. Submit owned image/audio; refresh and view saved private evidence. Upload failures must preserve the text ID.
5. Retry unchanged draft after interruption: same report IDs/replay. Conflicting retry key/payload fails. Check pending-AI UI without pretending a linked incident exists.
6. As Operator, check queue/filter/details/map, actual report count/signals and authorized evidence. Clearly matching reports may fuse; generic/distant/uncertain reports must not be forced together.
7. Verify incident, review/modify plan and separately approve it. Use Assign & Release to an active department. Confirm ASSIGNED and active assignment.
8. As that Department, verify trusted identity, local summaries/filters/search and selected map/detail synchronization. Another Department cannot read queue/details/evidence/actions.
9. Accept Assignment, Start Work with approved plan, add private update and submit completion with note. Refresh to confirm persistence.
10. Operator reviews completion, approves RESOLVED or rejects with reason to REOPENED. Reassign and confirm former Department access revocation/fresh acceptance.
11. Citizen feedback must stay disabled before final RESOLVED; eligible owner can submit YES/PARTIALLY/NO once. Duplicate/unrelated feedback fails; negative feedback does not auto-reopen.
12. Test stale expected_updated_at conflicts, backend unavailable, no incidents/filter matches/evidence/history, null-coordinate incidents and mixed mapped/text-only locations.
13. In both dashboards confirm MapTiler attribution, restricted browser key, visible tiles, marker selection and stable map lifecycle. Missing key shows fallback without broken tile requests.
14. Check desktop/tablet/mobile, Urdu direction, keyboard/focus, long labels, deep-link refresh and Auth redirects on actual hosting origins.

Browser tooling was blocked during earlier implementation by missing sandboxPolicy runtime metadata. No browser success is inferred from deterministic or in-process live API tests. Presentation preparation should use real implemented flows, not mocked screenshots or fabricated outcomes.

## Documentation validation

Check local Markdown links/anchors, route tables against FastAPI OpenAPI, frontend routes against App.tsx, environment names against code/examples, roles/statuses against models/SQL and tech versions against dependency manifests. Historical stage docs must stay explicitly historical. Run git diff --check. No application behavior/schema changes are part of documentation synchronization.
