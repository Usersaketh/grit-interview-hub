# Architecture

GRIT Interview Hub is a Next.js 15 App Router modular monolith deployed with standalone output, backed by Supabase for Auth, PostgreSQL, Row Level Security (RLS), and Realtime. The HTTP API lives under `/api/v1`; each route handler validates input with Zod, enforces rate limits/authentication/authorization, and delegates domain rules to `backend/modules/*`.

## Module layout

- `backend/modules/auth`: Public student registration (`registerStudentAccount`) and API-level rejection of privileged role fields (`assertNoPrivilegedSignupFields`).
- `backend/modules/invitations`: Cryptographic 256-bit invitation token issuance (`SHA-256` hashed in PostgreSQL), verification, revocation, and invitation-only `INTERVIEWER` provisioning.
- `backend/modules/eligibility`: Badge prerequisite skill clearance verification.
- `backend/modules/availability`: Recurring weekly windows, `AVAILABLE`/`UNAVAILABLE` overrides, DST-safe IANA wall-clock conversion (`zonedWallClockToUtc`), and real slot generation (`computeBookableSlots`).
- `backend/modules/booking`: Student interviewer discovery, real slot search (`discoverBookableSlots`), transactional booking (`book_interview`), cancellation (`cancel_student_booking`), and atomic rescheduling (`reschedule_student_booking`).
- `backend/modules/evaluations`: Interview session start, completion (`AWAITING_OUTCOME`), attendance/no-show recording, scoped workspace detail loading, and immutable result submission.
- `backend/modules/malpractice`: Malpractice reporting, transition reviews, badge nullification/reinstatement, searchable certification approval queue, and paginated audit log explorer.
- `backend/lib`: Supabase server/admin clients, environment configuration, `authorize` helpers, `AppError` mapping, structured logging, and sliding-window rate limiting (`rateLimit.ts`).
- `frontend/`: Complete role-aware React 19 UI under `features/{auth,student,interviewer,operations}`, shared `components/`, domain helpers (`lib/domain.ts`), and typed API client (`services/hubApi.ts`).

## Security model

- **Public signup boundary**: `/signup` and `POST /api/v1/auth/signup` only create `STUDENT` accounts. Client payloads containing `role`, `roles`, `assignedRole`, `app_metadata`, or `isAdmin` return `403 FORBIDDEN`. At the PostgreSQL layer, `handle_new_auth_user()` assigns `STUDENT` strictly unless `raw_app_meta_data.managed_provision = 'true'` is set by server-side provisioning or seed scripts.
- **Invitation-only interviewer onboarding**: Creating `INTERVIEWER` accounts requires an active `OPERATIONS` or `ADMIN` staff member issuing a single-use, expiring token via `POST /api/v1/admin/invitations`. Existing users accepting an invitation must authenticate with the invited email; unauthenticated acceptance only creates new accounts (never resetting passwords for existing accounts).
- **Authorization & RLS**: Supabase Auth authenticates sessions; server handlers verify `user_roles` via `requireRole`; `SECURITY DEFINER` RPCs use `SET search_path = ''` and re-check caller roles and resource ownership inside PostgreSQL. Direct `SELECT` on `badge_awards`, `malpractice_reports`, `audit_logs`, and `interviewer_invitations` is revoked from `authenticated` and `anon`. `SUPABASE_SERVICE_ROLE_KEY` is never exposed to the browser.
- **Middleware fallback**: `src/middleware.ts` refreshes sessions when Supabase is reachable and keeps unconfigured/public routes resilient without ever granting fallback authentication on protected portals.

## Transactional booking, cancellation & rescheduling

- `public.book_interview` rechecks eligibility, retake cooldowns, active interviewer availability, unavailable overrides, and busy windows inside a single transaction protected by `interviews_one_active_student_badge` and the `interviews_no_interviewer_overlap` GiST exclusion constraint.
- `public.cancel_student_booking` and `public.reschedule_student_booking` enforce a server-side 2-hour cutoff prior to `starts_at`, require a non-empty reason, record `interview_reschedule_history`, support idempotency keys, and write `audit_logs`, `notifications`, and `integration_outbox` atomically.

## Realtime & notifications

Booking, rescheduling, cancellation, evaluation, certification approval, and malpractice actions append in-app `notifications` and `integration_outbox` records transactionally. Optional external email workers may consume `integration_outbox` asynchronously when mail credentials are configured.
