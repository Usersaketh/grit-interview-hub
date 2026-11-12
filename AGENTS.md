# GRIT Interview Hub contributor rules

- Keep this a modular Next.js App Router monolith. Route handlers validate, authorize and delegate; they do not own domain rules.
- Use TypeScript strict mode, Zod at API boundaries, `timestamptz` for all instants and UUIDs for domain identities.
- Supabase Auth authenticates; server code authorizes roles and resource ownership; RLS is defense in depth. Never trust client roles or expose the service-role key.
- Preserve append-only audit history. Do not overwrite submitted evaluations, badge awards, or malpractice decisions.
- Booking/rescheduling mutations must remain transactional database operations protected by constraints; never replace them with read-then-insert application logic.
- Add a SQL migration for schema changes and keep seed data fictional. Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` before handoff.
