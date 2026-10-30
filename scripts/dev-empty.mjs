// Starts the dev server on a brand-new database, to see the app as a fresh
// install does: migrations have run, so the seed Food Categories and Meal Types
// exist, and nothing else does. `jeeves_empty` is dropped and made again on
// every run; the database at DATABASE_URL is never touched. Stop any other dev
// server first, as Next allows one per folder. Run with `pnpm dev:empty`.
// Refuses to run against a non-local host.
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const EMPTY_DATABASE = "jeeves_empty";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const host = new URL(url).hostname;
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
  console.error(`Refusing to reset a non-local database (${host})`);
  process.exit(1);
}

const admin = postgres(url, { max: 1, onnotice: () => {} });
try {
  await admin.unsafe(`DROP DATABASE IF EXISTS ${EMPTY_DATABASE} WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE ${EMPTY_DATABASE}`);
} finally {
  await admin.end();
}

const emptyUrl = new URL(url);
emptyUrl.pathname = `/${EMPTY_DATABASE}`;

const client = postgres(emptyUrl.href, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
} finally {
  await client.end();
}
console.log(`Starting on the empty database ${EMPTY_DATABASE}.`);

const next = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: emptyUrl.href },
});
next.on("exit", (code) => process.exit(code ?? 0));
