# Jeeves

Jeeves manages a household pantry: what food is in stock, which recipes can be made from it, and which meals are planned and eaten. It is a self-hosted, installable web app.

- Domain language: [`GLOSSARY.md`](GLOSSARY.md)
- V1 spec and data model: [`docs/v1/`](docs/v1/)
- Architecture decisions: [`docs/adr/`](docs/adr/)

## Development

### Requirements

- Node.js 22.12 or later, with [pnpm](https://pnpm.io) (`corepack enable` picks the version pinned in `package.json`)
- A Postgres instance you can connect to, or Docker to run a development one

### Run locally

```sh
pnpm install
cp .env.example .env   # then set DATABASE_URL
pnpm db:up
pnpm db:migrate
pnpm dev               # http://localhost:3000
```

### Run tests and checks

```sh
pnpm test        # Vitest, once
pnpm test:watch  # Vitest, watch mode
pnpm typecheck
pnpm lint
```

Two lint rules carry project decisions:

- Code in `src/core/` must not import Next.js, React, Drizzle or anything outside `src/core/` (ADR 0001); inside core, import across folders with `@/core/...`, not `../`. `src/core/boundary.test.ts` checks the rule stays active.
- JSX must not contain hard-coded text. Every user-facing string lives in `src/strings/en.ts` and is read with `t("key")`, or `t("key", { name: value })` for `{name}` placeholders.

### Migrations

Tables are defined in `src/db/schema.ts`; migrations live in `drizzle/`.

```sh
pnpm db:generate  # write a migration from schema changes
pnpm db:migrate   # apply pending migrations to DATABASE_URL
```

### Empty database

```sh
pnpm dev:empty    # dev server on a brand-new database, to see empty states
```

It starts as a fresh install does, with only the seed Food Categories and Meal Types. Its data is thrown away on the next run, and the database at `DATABASE_URL` is never touched. Stop any other dev server first.

## Container

The image runs the production server and connects to an existing Postgres instance through `DATABASE_URL`.

```sh
cp .env.example .env              # set DATABASE_URL
docker compose up -d --build      # applies migrations, then starts the app on PORT (default 3000)
docker compose run --rm migrate   # apply migrations on their own
```

To build the image without Compose: `docker build --target app -t jeeves .`

Inside a container, `localhost` is the container itself: point `DATABASE_URL` at the Postgres host's address.
