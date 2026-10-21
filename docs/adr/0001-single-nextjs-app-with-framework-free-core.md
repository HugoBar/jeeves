# Single Next.js app with a framework-free core, no separate API server

Jeeves is one Next.js (App Router, TypeScript) app that serves both UI and backend through server actions and route handlers; there is no Express (or other) API server. All domain logic — unit conversion, Stock deduction, Projected Stock, Suggestions, Shopping List generation — lives in a plain-TypeScript `core` module with no Next.js or database-driver imports, so a standalone API can wrap it later (e.g. for a native mobile client) without rewriting the domain.

## Considered Options

- **Next.js frontend + separate Express/Fastify/Hono API**: rejected for V1 — two servers and deploys plus a hand-maintained API contract, with only one client to serve.
