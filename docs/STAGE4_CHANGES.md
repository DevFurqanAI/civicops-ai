# Stage 4 historical implementation record

This is historical, not current setup guidance. See [architecture](ARCHITECTURE.md), [SQL applicability](../backend/sql/README.md), [API](API_CONTRACT.md) and [testing](TESTING.md).

Stage 4 introduced Supabase Auth login/session verification, trusted profiles.role authorization, owned-report idempotency/access, safe tracking history, private Operator notes and atomic status/assignment/plan/feedback RPCs with expected_updated_at protection.

At that stage roles were Citizen/Operator/Admin and operational work did not include the Department verification gate. Those assumptions are superseded by the current Department migration. Never reapply stage4_operations.sql over the current system.

Historical media/signup/reset deferrals were completed in Stage 5. Current roles include Department; final resolution follows Department completion and Operator verification. Historic live checks used in-process FastAPI with real services, not browser automation. Old test totals and per-stage file inventories are not current verification results; Git history preserves the original changes.
