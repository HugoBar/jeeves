import "server-only";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Any Postgres driver: the app uses postgres-js, database tests use PGlite.
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let db: ReturnType<typeof createDb> | undefined;

function createDb(url: string) {
  return drizzle(postgres(url), { schema });
}

// Created on first use so `next build` does not need DATABASE_URL.
export function getDb() {
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    db = createDb(url);
  }
  return db;
}
