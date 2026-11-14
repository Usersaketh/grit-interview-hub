# Manual setup

## Mandatory

1. Create a Supabase project and install the Supabase CLI.
2. Run `supabase login`, `supabase link --project-ref <ref>`, then `supabase db push`. For local development, run `supabase start` then `supabase db reset` to apply migrations and seed data.
3. Copy `.env.example` to `.env.local`; set the project URL, anon/publishable key, service-role key (server only), and application URL (`NEXT_PUBLIC_APP_URL=http://localhost:3000` locally, `NEXT_PUBLIC_APP_URL=https://gritinterviewhub.vercel.app` in production) from Supabase Dashboard → Settings → API.
4. **Configure Supabase Authentication URLs** in Supabase Dashboard → Authentication → URL Configuration:
   - **Site URL**: `https://gritinterviewhub.vercel.app` (for production deployments; local CLI dev uses `supabase/config.toml`).
   - **Redirect URLs** (allow-list both production and local callback endpoints):
     - `https://gritinterviewhub.vercel.app/auth/callback`
     - `https://gritinterviewhub.vercel.app/**`
     - `http://localhost:3000/auth/callback`
     - `http://localhost:3000/**`
   - Never keep `http://localhost:3000` as the production **Site URL** or leave production redirect URLs missing from the allow-list, as Supabase falls back to **Site URL** whenever `emailRedirectTo` is not allow-listed.
5. **Configure the Supabase Signup Email Template** in Supabase Dashboard → Authentication → Emails → Templates → **Confirm signup**:
   - Copy the HTML from `Docs/email-templates/supabase-confirm-signup.html` and paste it into the template body (uses `{{ .ConfirmationURL }}`).
   - Set the subject to `Confirm your GRIT Interview Hub account`.
6. **Configure the Supabase Interviewer Invitation Email Template** in Supabase Dashboard → Authentication → Emails → Templates → **Invite user**:
   - Copy the HTML from `Docs/email-templates/supabase-invite-user.html` and paste it into the template body (uses `{{ .ConfirmationURL }}` and safe Go template variables).
   - Set the subject to `You're invited to become a GRIT Interviewer`.
   - Ensure `SUPABASE_SERVICE_ROLE_KEY` is configured on the server so Operations/Admin invitations trigger `supabase.auth.admin.inviteUserByEmail(...)` via Supabase's configured SMTP transport. (Do not modify existing SMTP credentials.)
7. In Database → Replication, enable the documented tables if realtime is required; configure Realtime Authorization before exposing channels.
8. Create a GitHub repository, commit this code, then import it into Vercel. Configure the exact same environment variables in Vercel (set `NEXT_PUBLIC_APP_URL=https://gritinterviewhub.vercel.app` and mark `SUPABASE_SERVICE_ROLE_KEY` as sensitive) and deploy.

Run locally: `npm install`, `npm run dev`. Verify: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

## Optional

Obtain GRIT's approved identity, skills, certification and nullification API contracts before replacing the read model/integration adapter.
