FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# One-off migration runner: `docker compose run --rm migrate`, also run before `app` starts.
FROM deps AS migrate
COPY drizzle ./drizzle
COPY scripts ./scripts
CMD ["node", "scripts/migrate.mjs"]

FROM node:22-alpine AS app
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S jeeves && adduser -S jeeves -G jeeves
COPY --from=build /app/public ./public
COPY --from=build --chown=jeeves:jeeves /app/.next/standalone ./
COPY --from=build --chown=jeeves:jeeves /app/.next/static ./.next/static
USER jeeves
EXPOSE 3000
CMD ["node", "server.js"]
