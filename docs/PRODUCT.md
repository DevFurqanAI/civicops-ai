# CivicOps AI product scope

## Purpose and problem

CivicOps AI is a Pakistan-focused multilingual civic incident intelligence and response coordination platform. It addresses fragmented complaints, duplicate submissions, language barriers, weak routing, limited operational visibility and accessibility constraints.

A Report is an individual citizen submission. An Incident is an operational issue that can group multiple related reports. The platform connects citizen reporting to persistent human-supervised work rather than stopping at a chatbot reply or ticket creation.

## Implemented experience

| User | Current experience |
| --- | --- |
| Citizen | Describe an issue in English/Urdu/Roman Urdu, optionally add written landmark/GPS and private evidence, submit and track |
| Operator | Review incident intelligence, supporting signals and evidence; verify, review plans, Assign & Release and confirm/reject completion |
| Department | View only own released work, accept/start, record private updates and submit completion |
| Admin | Same implemented operational interface as Operator; no separate public administration flow |

Anonymous text-only reporting remains available. Signed-in report owners may upload private images/audio and submit eligible feedback. Manual landmark/location is valid without GPS; both can coexist. A text description remains required even with audio; audio is evidence, not transcribed intake.

## Intelligence and response

Groq schema-validated extraction supplies category, summary, reported urgency, civic relevance and suspected injection. Rules determine final priority and seeded-department routing. Evidence confidence and spam risk are separate basic heuristics.

Conservative incident fusion uses same-category text/summary agreement, specific landmarks, distance when available and temporal proximity. It stores explainable matching details and avoids forced uncertain matches. It does not use embeddings or verify independent sources/images.

Suggested response plans are currently templates. Human approval is required before Department work starts. Only Operator/Admin may confirm final resolution; Department completion remains Resolved Pending Verification.

## Core operational loop

Citizen report → structured intake → persistence/fusion → Operator review → Assign & Release → Department acceptance/work → completion submission → Operator verification → final resolution → eligible citizen feedback.

NO/PARTIALLY feedback records a review signal; it never reopens automatically. Safe tracking shows actual history, not private operational notes or fabricated events. See [canonical architecture/lifecycle](ARCHITECTURE.md).

## Product principles

- Describe, locate, optionally attach evidence, submit; no citizen category selector.
- Keep English/Urdu/Roman Urdu visible; GPS remains optional.
- Incident queue/intelligence are primary; maps support situational awareness.
- Distinguish AI extraction/templates, deterministic rules and human decisions.
- Use real data, explicit roles and authorized evidence; no simulated operational success.
- Preserve original reports, histories/audits and department isolation.

## Implemented scope versus future work

Implemented: web intake, accounts/reset, private evidence, durable idempotency, conservative fusion, maps, trusted roles, transactional operations, department work, tracking and gated feedback.

Future/unimplemented: WhatsApp/SMS intake, notifications, offline synchronization, stronger semantic matching, calibrated trust scoring, media transcription/corroboration, distributed abuse prevention, retention/orphan cleanup, multi-department membership, completion-photo uploads, advanced analytics and government integrations. There is no public role-promotion or completed Department archive.

The code does not establish production certification or complete government deployment. Full helper-copy translation and live-browser acceptance remain verification limits.
