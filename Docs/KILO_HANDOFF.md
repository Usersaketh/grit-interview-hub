# Operations & Deployment Handoff

GRIT Interview Hub now ships end-to-end across PostgreSQL migrations, `/api/v1` route handlers, domain services, and all three role portals (`Student`, `Interviewer`, `Operations/Admin`).

## Deploying to a Live Supabase Project

1. Configure required environment variables (see `.env.example`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only; used strictly by administrative provisioning/invitation verification helpers)
2. Apply all migrations in order (`202611120001` through `202611140005`) via `supabase db push` (or `supabase db reset` for fresh local environments with `supabase/seed.sql`).
3. Verify Auth settings in Supabase Dashboard:
   - Email confirmations may be enabled or disabled; `/signup` handles both immediate sessions and email-verification states automatically.
   - Public signup always assigns `STUDENT`. Seeded accounts (`OPERATIONS`, `ADMIN`, `INTERVIEWER`) require `"managed_provision": "true"` in `raw_app_meta_data` when seeded directly, or must be onboarded through `/operations/invitations`.
4. Build and run verification checks prior to deployment:
   - `npm run typecheck`
   - `npm run lint`
   - `npm test`
   - `npx --yes tsx --test frontend/lib/domain.test.ts`
   - `npm run build`

## Optional Production Hardening Extensions

- Attach an authenticated background worker or Supabase Edge Function to deliver `integration_outbox` email events with provider credentials.
- Replace direct `skill_progress` seeding with an upstream GRIT sync adapter when connecting to the external LMS/curriculum system.
- Enable Supabase Realtime replication and channel authorization policies for `interviews`, `badge_awards`, and `notifications` if push updates are desired alongside pull refreshes.
