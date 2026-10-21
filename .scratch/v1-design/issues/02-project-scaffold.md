# Project scaffold

Status: ready-for-agent
Blocked by: none

Set up the empty app so every later ticket has a home. See `../spec.md` (Platform) and ADRs 0001/0002.

## Acceptance
- Next.js (App Router) + TypeScript app, mobile-first layout shell, installable as a PWA (manifest + basic service worker).
- A `core` module with no Next.js/Drizzle imports (enforced by a lint rule or import boundary), with Vitest wired up.
- Drizzle configured against Postgres via `DATABASE_URL`; migrations runnable from a script.
- Centralised UI strings file (English only). Every user-facing string goes through it; no hardcoded text in components.
- Dockerfile + docker-compose for the app, connecting to an existing Postgres instance via `DATABASE_URL`.
- README section: run locally, run tests, run migrations, build the container.
