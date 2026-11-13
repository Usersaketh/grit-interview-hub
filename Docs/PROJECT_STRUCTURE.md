# Project Structure

## Overview

GRIT Interview Hub is a Next.js App Router application with a cleanly separated frontend and backend. The application is API/database-first: the production surface is the `/api/v1` HTTP API backed by Supabase (Auth, PostgreSQL, RLS). The `frontend/` directory exists to hold future client-side UI code; no product frontend ships in this iteration.

## Directory layout

```
frontend/
  components/      Reusable UI components
  features/        Feature-specific UI (student, interviewer, operations)
  services/        Frontend API clients that call existing /api/v1 routes
  hooks/           Frontend React hooks
  types/           Frontend-specific TypeScript types
  styles/          Frontend styles

backend/
  modules/         Backend business-logic services (eligibility, availability,
                   booking, evaluations, malpractice)
  lib/             Backend-only utilities (Supabase clients, config,
                   authorization, errors, logging)
  validation/      Zod validation schemas used at API boundaries

src/
  app/             Next.js App Router routing layer (pages, layouts,
                   and /api/v1 route handlers). Must NOT be moved.

supabase/          Migrations and seed data (untouched)
tests/             Vitest unit tests
Docs/              Documentation
public/            Static assets
```

## Why src/app/ remains the Next.js routing layer

Next.js App Router discovers pages, layouts, template, route handlers, and API
endpoints by file-system convention under `src/app/`. Moving these files would
break routing and change endpoint URLs, which is explicitly prohibited. The
route handlers under `src/app/api/v1/` therefore stay exactly where they are,
with unchanged URLs and request/response contracts.

Route handlers validate input (Zod), authenticate/authorize via
`backend/lib/auth/authorize`, then delegate to the appropriate
`backend/modules/*` service. They own HTTP concerns only; domain rules live in
`backend/modules/`.

## How frontend services communicate with existing API routes

Frontend API clients under `frontend/services/` call the existing
`/api/v1/` route handlers (e.g. `/api/v1/student/interviews/book`) using the
browser fetch API or a lightweight client. These are relative, same-origin
calls, so no backend URL contract changes. No service-role credentials or
server-only modules are imported into frontend code.

## Where shared code belongs

There is no genuinely shared frontend/backend module in this codebase: every
file outside `src/app/` is server-side backend code (Supabase service-role
access, authorization, RPC error mapping, business logic). Consequently all of
it lives under `backend/`. If truly shared code is introduced later, it should
live in a location both sides can import without creating inappropriate
frontend/backend dependencies (for example a `shared/` directory at the repo
root or colocated with its primary consumer), never duplicated as compatibility
copies.

## Import alias conventions

Defined in `tsconfig.json` and `vitest.config.ts`:

- `@/*` -> `./src/*` - Next.js app router and anything still under `src/`
- `@backend/*` -> `./backend/*` - backend modules, lib, and validation
- `@frontend/*` -> `./frontend/*` - frontend code (reserved for future UI)

API route handlers under `src/app/api/` import from `@backend/...`. Tests
import from `@backend/...` as well. Avoid long relative import chains and do not
re-export moved modules from their old locations.
