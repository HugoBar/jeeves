# Jeeves

Jeeves manages a household pantry: what food is in stock, which recipes can be made from it, and which meals are planned and eaten. It is a self-hosted, installable web app.

## Running Jeeves

### Requirements

- Docker (with Compose)
- Git

### Install

```sh
git clone https://github.com/HugoBar/jeeves.git
cd jeeves
cp .env.example .env   # then set POSTGRES_PASSWORD
docker compose up -d --build
```

Jeeves is now at <http://localhost:3000>. Set `PORT` in `.env` to use another port. Its data is kept in the `jeeves-db` Docker volume, and it starts again on its own after a reboot.

Set `POSTGRES_PASSWORD` before the first start: the database is created with it, and changing it later in `.env` does not change it in the database.

### Update

```sh
git pull
docker compose up -d --build
```

New migrations are applied automatically before the app starts.

## Development

- Domain language: [`GLOSSARY.md`](GLOSSARY.md)
- V1 spec and data model: [`docs/v1/`](docs/v1/)
- Architecture decisions: [`docs/adr/`](docs/adr/)

### Requirements

- Node.js 22.12 or later, with [pnpm](https://pnpm.io) (`corepack enable` picks the version pinned in `package.json`)
- A Postgres instance you can connect to, or Docker to run a development one

### Run locally

```sh
pnpm install
cp .env.example .env   # DATABASE_URL already points at the database pnpm db:up starts
pnpm db:up
pnpm db:migrate
pnpm dev               # http://localhost:3000
```

`pnpm dev` and `pnpm dev:empty` start the development database first if nothing answers at a local `DATABASE_URL`, and open Docker Desktop on Windows and macOS if Docker isn't running yet. Otherwise, start Docker yourself.

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

To build the image without Compose: `docker build --target app -t jeeves .`
