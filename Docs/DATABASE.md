# Database

Migration: `supabase/migrations/202611120001_initial_schema.sql`; fictional local data: `supabase/seed.sql`.

Identity is `auth.users` → `profiles`, with many-to-many `user_roles`; `students` and `interviewers` are role-specific profiles. Reference/read-model data is tracks, badges, skills, requirements and verified skill progress. Scheduling data is recurring availability, overrides, interviews, reschedule history and attendance. Evaluation/certification data is results, awards, malpractice reports and reinstatements. Supporting tables are notifications, audit logs, idempotency records and integration outbox.

Important integrity controls: `interviews_one_active_student_badge`, `interviews_no_interviewer_overlap` (GiST time-range exclusion), result-per-interview uniqueness, retake-date check, foreign keys, and enum/check constraints. All instants are `timestamptz`.

RLS enables self/staff scoped profiles, student progress, interviews, results, awards, notifications and staff audit visibility. Availability has interviewer ownership policies. The booking RPC has a narrowly scoped security-definer implementation and requires an authenticated student.

`book_interview(...)` atomically validates and creates booking/outbox/audit data. `submit_interview_result(...)` atomically authorizes the assigned interviewer, deduplicates a submission, writes the result, marks the interview evaluated, and, only for PASS, creates a `CERTIFICATION_PENDING` record plus outbox event. It never awards a badge. Internal idempotency and outbox tables have RLS enabled with no client policies. Run migrations via Supabase CLI (`supabase db push`) rather than applying manually in production.

## Malpractice workflow (migrations 202611130004 and 202611130005)

New security-definer RPCs (additive; no existing tables modified):

- `create_malpractice_report(student_id, badge_id, reason_code, description, evidence_reference, idempotency_key)` — staff only; creates a `REPORTED` case; idempotent; prevents duplicate outstanding cases per student/badge via advisory lock + partial unique index.
- `review_malpractice_report(report_id, to_status, reviewer_notes, idempotency_key)` — staff only; valid transitions: `REPORTED→UNDER_REVIEW`, `UNDER_REVIEW→DISMISSED`, `UNDER_REVIEW→CONFIRMED`, `CONFIRMED→APPEALED`; reporter cannot review their own case; captures original state in audit `previous_value`.
- `nullify_badge_award(report_id, idempotency_key)` — staff only; requires report status `CONFIRMED`; nullifies an `AWARDED` badge award (sets `status=NULLIFIED`, `nullified_at`); never modifies the original interview result; emits `badge.certification.nullified` outbox event; idempotent; fails on ambiguous award selection.
- `reinstate_badge_award(report_id, reason, idempotency_key)` — staff only; requires report status `DISMISSED` or `APPEALED` (resolved); reinstates a `NULLIFIED` badge award (sets `status=REINSTATED`, `reinstated_at`); inserts `badge_reinstatements` history row; idempotent; fails on ambiguous award selection.
- `malpractice_queue()` — staff only; returns all malpractice reports including sensitive fields for staff review; SECURITY DEFINER.
- `student_malpractice_status()` — student only; returns sanitized badge award and malpractice report status using UNION ALL (no multiplicative rows); never exposes `evidence_reference`, `reviewer_notes`, `reported_by`, or `description`; SECURITY DEFINER.

Security:

- Direct `SELECT` on `malpractice_reports` and `badge_awards` is **revoked** from `authenticated` and `anon`; no column-level grants on sensitive columns.
- All six malpractice RPCs: `REVOKE EXECUTE FROM PUBLIC, anon`; `GRANT EXECUTE TO authenticated` only.
- RLS policy `malpractice reports staff` (staff all) remains as defense in depth; the student self-select policy on `malpractice_reports` was dropped.
- Partial unique index `malpractice_reports_one_outstanding_per_student_badge` covers unresolved statuses (`REPORTED`, `UNDER_REVIEW`, `CONFIRMED`, `APPEALED`); `DISMISSED` and `REINSTATED` do not block future reports.
- All mutating RPCs use advisory locks, canonical request payloads, idempotency replay checks, `SELECT ... FOR UPDATE` on report/award rows, and transactional consistency across state change + audit + idempotency + outbox.
