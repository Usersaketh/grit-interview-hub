# Kilo handoff

Inspect `supabase/migrations/202611120001_initial_schema.sql`, `backend/modules/booking/service.ts`, `backend/modules/evaluations/service.ts`, and `Docs/IMPLEMENTATION_STATUS.md` first. Preserve the database RPC and constraints as the booking authority.

Priority work: (1) add migrations/RPCs for cancellation/rescheduling, attendance/start/complete/reassignment and their audit records; (2) implement available-slot generation with timezone-aware recurring/override precedence and policy configuration; (3) add operations, malpractice review/nullification/reinstatement and certification confirmation services/routes; (4) implement an authenticated outbox worker and optional email adapter; (5) add Supabase local integration/concurrency tests and OpenAPI 3.1 spec; (6) add realtime client subscriptions only after channel policies are configured.

Use this first prompt: “Continue GRIT Interview Hub from the existing backend foundation. Read AGENTS.md, Docs/ARCHITECTURE.md, Docs/DATABASE.md and the initial migration. Implement cancellation and transaction-safe rescheduling as PostgreSQL RPCs with configurable cutoff policy, idempotency, audit history, outbox events, RLS-aware API routes and Vitest coverage. Do not alter the booking exclusion constraint or replace database transactions with application-level checks.”
