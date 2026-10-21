import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

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
