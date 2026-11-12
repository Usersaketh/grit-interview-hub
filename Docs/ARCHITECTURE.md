# Architecture

GRIT Interview Hub is a Next.js App Router modular monolith deployed to Vercel, with Supabase providing Auth, PostgreSQL, Realtime, and (when needed) Storage. The HTTP API lives below `/api/v1`; each handler validates Zod input, authenticates, authorizes, then calls a domain service.

Modules are `eligibility`, `availability`, `booking`, and `evaluations` under `src/modules`. `src/lib` owns Supabase clients, configuration, authorization, errors, logging, and validation. The GRIT adapter boundary is the local `skill_progress` read model: it is intentionally not a fabricated GRIT API. Future GRIT synchronization should replace population of that read model and process `integration_outbox` events.

## Security model

Supabase Auth establishes the user. Server-side `requireRole` reads role assignments from `user_roles`; routes also check ownership (for example, evaluation requires the assigned interviewer). RLS repeats data-access boundaries for direct authenticated Supabase calls. The service-role client is server-only and reserved for worker/admin integration scenarios.

## Transactional booking

`public.book_interview` is a PostgreSQL security-definer RPC invoked as the authenticated student. It rechecks verified skill progress, active interviewer status, recurring availability, unavailable overrides, valid time range, and then inserts the interview, notification, outbox event, idempotency response and audit record in one transaction. A partial unique index allows one active student/badge booking. A GiST exclusion constraint rejects interviewer time-range overlap. Retried idempotency keys return the original interview. PostgreSQL—not frontend state—arbitrates races.

## Realtime

Enable replication for `interviews`, `interviewer_availability`, `interview_results`, `notifications`, and `badge_awards` in the Supabase dashboard. Clients use private channels named `grit:student:{userId}`, `grit:interviewer:{interviewerId}`, and `grit:operations`, carrying minimal IDs/event types only. Database state remains authoritative; clients refetch after reconnect. Channel authorization requires Supabase Realtime Authorization policies before production.

## Notifications and reliability

Booking creates an in-app notification plus an outbox event atomically. An external worker may deliver email only when credentials are configured; it must mark status/retry failures and must never claim delivery otherwise. No background worker is shipped because Vercel Hobby cannot run durable workers.
