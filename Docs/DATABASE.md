# Database

Core schema and progressive hardening migrations live in `supabase/migrations/`:

1. `202611120001_initial_schema.sql` — Identity (`profiles`, `user_roles`, `students`, `interviewers`), tracks/badges/skills (`skill_progress`), availability & overrides, `interviews` (with `interviews_one_active_student_badge` and `interviews_no_interviewer_overlap` GiST exclusion), `interview_reschedule_history`, `interview_attendance`, `interview_results`, `badge_awards`, `malpractice_reports`, `badge_reinstatements`, `notifications`, `audit_logs`, `idempotency_records`, `integration_outbox`.
2. `202611120002_restore_minimum_authenticated_grants.sql` — Restores baseline table grants required by authenticated RLS policies.
3. `202611120003_harden_booking_eligibility.sql` — Hardens booking eligibility checks against `skill_progress`.
4. `202611130001_harden_evaluation_rpc.sql` — Hardens `submit_interview_result` idempotency and authorization.
5. `202611130002_fix_attendance_update_policy.sql` — Scopes attendance RLS policies cleanly.
6. `202611130003_enforce_booking_idempotency_payload.sql` — Canonical payload verification for idempotent booking retries.
7. `202611130004_malpractice_workflow.sql` & `202611130005_malpractice_security_hardening.sql` — Malpractice state machine (`create_malpractice_report`, `review_malpractice_report`, `nullify_badge_award`, `reinstate_badge_award`, `malpractice_queue`, `student_malpractice_status`), revokes direct `SELECT` on `badge_awards`/`malpractice_reports`.
8. `202611130006_approve_badge_certification.sql` — `approve_badge_certification` RPC for `CERTIFICATION_PENDING -> AWARDED`.
9. `202611140001_signup_role_provisioning.sql` — Adds `handle_new_auth_user()` trigger on `auth.users` (assigns `STUDENT` unconditionally unless `raw_app_meta_data.managed_provision = 'true'`) and `ensure_student_profile()` RPC.
10. `202611140002_interviewer_invitations.sql` — Adds `interviewer_invitations` table (SHA-256 `token_hash`, `PENDING`/`ACCEPTED`/`REVOKED`/`EXPIRED`, partial unique index on active pending email), adds `title`/`bio`/`expertise_tags` on `interviewers`, revokes direct table access, and creates `create_interviewer_invitation`, `list_interviewer_invitations`, `revoke_interviewer_invitation`, and `accept_interviewer_invitation` RPCs.
11. `202611140003_interviewer_discovery_and_slots.sql` — Adds `list_bookable_interviewers` and `get_bookable_slot_inputs` RPCs so students browse active interviewers and real available/busy/cooldown inputs safely without opening broad RLS on `interviewers` or other students' `interviews`.
12. `202611140004_interview_lifecycle_and_reschedule_cancel.sql` — Updates `book_interview` to enforce `retake_after` cooldowns; adds `cancel_student_booking` (2h cutoff), `reschedule_student_booking` (2h cutoff + GiST conflict preservation + `interview_reschedule_history`), `start_interview`, `complete_interview_session`, `record_interview_attendance` (supports `NO_SHOW`), and `get_interview_workspace_detail`.
13. `202611140005_certifications_and_audit_rpcs.sql` — Adds `audit_logs_immutable_trg` preventing `UPDATE`/`DELETE` on `audit_logs`, revokes direct `SELECT` on `audit_logs`, and adds `list_badge_certifications`, `get_badge_certification_detail`, and `list_audit_logs` RPCs.

## Seed & migration usage

- Fictional local seed data lives in `supabase/seed.sql` (`managed_provision: "true"` set on seeded `auth.users` rows so `handle_new_auth_user()` preserves custom seeded `INTERVIEWER`/`OPERATIONS`/`ADMIN` roles).
- When provisioning or updating a Supabase PostgreSQL instance, run `supabase db push` or `supabase db reset` before exercising the full live application.
- Every `SECURITY DEFINER` RPC uses `SET search_path = ''`, explicit `auth.uid()` and role assertions, row-level locking (`SELECT ... FOR UPDATE`), advisory locks where needed, idempotency replay/conflict checks, and transactional `audit_logs` + `integration_outbox` recording.
