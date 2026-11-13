# Project Structure

## Overview

GRIT Interview Hub is a full-stack Next.js 15 App Router modular monolith combining a complete React frontend (`frontend/` + `src/app/` pages) with a cleanly separated server-side API and domain layer (`backend/` + `src/app/api/v1/`), backed by Supabase Auth and PostgreSQL migrations (`supabase/`).

## Directory layout

```
frontend/
  components/      Shared UI primitives (AppShell, ConfirmDialog, PageHeader, StatusText, SurfaceStates, ThemeToggle)
  features/
    auth/          LandingView, LoginView, SignupView, AcceptInvitationView
    student/       StudentDashboard, Badges, Interviews, Booking (slot discovery), InterviewDetail (cancel/reschedule), Malpractice
    interviewer/   InterviewerDashboard, Availability, Schedule, History, InterviewerEvaluationView (lifecycle + attendance + rubric)
    operations/    OperationsDashboard, Invitations, Certifications, CertificationDetail, MalpracticeQueue, MalpracticeDetail, Interviews, Students, AuditExplorer
  hooks/           useAuth, useToast, useTheme
  lib/             Pure frontend domain validation/state helpers (`domain.ts`) + `node:test` suite (`domain.test.ts`)
  services/        Typed same-origin API clients (`apiClient.ts`, `hubApi.ts`, `supabaseBrowser.ts`)
  styles/          Tailwind v4 theme & CSS design tokens (`globals.css`)
  types/           API request/response and domain TypeScript contracts (`api.ts`)

backend/
  modules/
    auth/          Public student signup & role-injection defense
    invitations/   SHA-256 invitation token lifecycle & interviewer provisioning
    eligibility/   Skill clearance checks
    availability/  DST-safe slot computation & availability window math
    booking/       Interviewer directory, slot discovery, booking, cancellation, rescheduling
    evaluations/   Session start/complete, attendance/no-show, workspace detail, result submission
    malpractice/   Malpractice queue/review/nullify/reinstate, certification queue/approval, audit logs
  lib/             Supabase server/admin clients, config, authorize, errors, logging, rateLimit
  validation/      Zod schemas for all API routes (`schemas.ts`)

src/
  middleware.ts    Session refresh + safe fallback when unconfigured
  app/
    page.tsx, login/, signup/, invitations/accept/
    student/...
    interviewer/...
    operations/...
    api/v1/
      auth/signup/
      invitations/{verify,accept}/
      profile/
      student/{interviewers,slots,badges/[badgeId]/eligibility,interviews,interviews/book,interviews/[id],interviews/[id]/cancel,interviews/[id]/reschedule,malpractice-status}/
      interviewer/{availability,availability/[id],interviews/[id],interviews/[id]/start,interviews/[id]/awaiting-outcome,interviews/[id]/attendance,interviews/[id]/result}/
      admin/{dashboard,invitations,invitations/[id]/revoke,badge-certifications,badge-certifications/[id],badge-certifications/[id]/approve,malpractice,malpractice/[id]/review,malpractice/[id]/nullify,malpractice/[id]/reinstate,audit-logs}/

supabase/
  migrations/      202611120001 through 202611140005
  seed.sql         Fictional seed users, badges, skill progress, availability, and invitations setup

tests/
  unit/            Vitest unit tests covering auth signup, invitations, eligibility, availability/DST, booking, evaluations, certifications/audit, malpractice
```

## Import alias conventions

Defined in `tsconfig.json` and `vitest.config.ts`:

- `@/*` -> `./src/*`
- `@backend/*` -> `./backend/*`
- `@frontend/*` -> `./frontend/*`

Route handlers under `src/app/api/v1/` import strictly from `@backend/*`. Frontend code under `frontend/` and page entries under `src/app/` never import `backend/lib/supabase/admin.ts` or any service-role credential.
