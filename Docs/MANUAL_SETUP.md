# Manual setup

## Mandatory

1. Create a Supabase project and install the Supabase CLI.
2. Run `supabase login`, `supabase link --project-ref <ref>`, then `supabase db push`. For local development, run `supabase start` then `supabase db reset` to apply migrations and seed data.
3. Copy `.env.example` to `.env.local`; set the project URL, anon/publishable key, service-role key (server only), and application URL from Supabase Dashboard → Settings → API.
4. In Supabase Dashboard, configure the desired Auth provider and redirect URLs for the application. Do not use the demo accounts in production.
5. In Database → Replication, enable the documented tables if realtime is required; configure Realtime Authorization before exposing channels.
6. Create a GitHub repository, commit this code, then import it into Vercel. Configure exactly the same environment variables in Vercel (mark service-role as sensitive) and deploy.

Run locally: `npm install`, `npm run dev`. Verify: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

## Optional

Configure an email provider and set `EMAIL_PROVIDER_API_KEY` and `EMAIL_FROM`, then implement/deploy a worker for the outbox. Obtain GRIT's approved identity, skills, certification and nullification API contracts before replacing the read model/integration adapter.
