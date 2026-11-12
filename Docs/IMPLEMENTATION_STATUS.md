# Implementation status

Completed: initial Next.js API project; strict configuration; Supabase Auth client; role authorization helper; migration with core domain schema, RLS, audit/outbox/idempotency tables; seed data; atomic booking and evaluation RPCs; eligibility and availability logic; protected profile, eligibility, booking, interview history, availability, evaluation and operations summary routes; unit tests; deployment documentation.

Partial: availability is recurring-window CRUD but has no slot-search endpoint or configurable policy/buffer persistence; evaluation creates certification-pending records but lacks an authorized confirmation worker; notification/outbox tables exist but no delivery worker; realtime convention is documented but clients/channels are not implemented. Operations, attendance, lifecycle transitions, reschedule/cancel, reassignment, badge confirmation, and malpractice routes/services remain to be built.

Not implemented: GRIT API integration, email provider adapter, rate limiting, OpenAPI generated artifact, Playwright tests, durable outbox processor, complete RLS test suite, production monitoring and deployment.
