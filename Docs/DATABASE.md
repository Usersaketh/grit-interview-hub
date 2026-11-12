# Database

Migration: `supabase/migrations/202611120001_initial_schema.sql`; fictional local data: `supabase/seed.sql`.

Identity is `auth.users` → `profiles`, with many-to-many `user_roles`; `students` and `interviewers` are role-specific profiles. Reference/read-model data is tracks, badges, skills, requirements and verified skill progress. Scheduling data is recurring availability, overrides, interviews, reschedule history and attendance. Evaluation/certification data is results, awards, malpractice reports and reinstatements. Supporting tables are notifications, audit logs, idempotency records and integration outbox.

Important integrity controls: `interviews_one_active_student_badge`, `interviews_no_interviewer_overlap` (GiST time-range exclusion), result-per-interview uniqueness, retake-date check, foreign keys, and enum/check constraints. All instants are `timestamptz`.

RLS enables self/staff scoped profiles, student progress, interviews, results, awards, notifications and staff audit visibility. Availability has interviewer ownership policies. The booking RPC has a narrowly scoped security-definer implementation and requires an authenticated student.

`book_interview(...)` atomically validates and creates booking/outbox/audit data. `submit_interview_result(...)` atomically authorizes the assigned interviewer, deduplicates a submission, writes the result, marks the interview evaluated, and, only for PASS, creates a `CERTIFICATION_PENDING` record plus outbox event. It never awards a badge. Internal idempotency and outbox tables have RLS enabled with no client policies. Run migrations via Supabase CLI (`supabase db push`) rather than applying manually in production.
