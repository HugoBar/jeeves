// A fresh in-memory Postgres (PGlite) with every migration applied, so
// database tests need no server.
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach } from "vitest";
import * as schema from "./schema";

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;

// After migrating, copies every table into the `test_seed` schema and adds
// `test_seed.reset()`, which empties every table and puts the copies back.
// Triggers and foreign keys are off while it puts them back, so the order of
// tables does not matter and the rows come back exactly as they were.
// It covers tables in `public` only, and sequences owned by a column.
const SNAPSHOT = `
CREATE SCHEMA test_seed;

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('CREATE TABLE test_seed.%I AS SELECT * FROM public.%I', t, t);
  END LOOP;
END $$;

CREATE FUNCTION test_seed.reset() RETURNS void LANGUAGE plpgsql AS $$
DECLARE t text;
BEGIN
  PERFORM set_config('session_replication_role', 'replica', true);
  EXECUTE (
    SELECT 'TRUNCATE ' || string_agg(format('public.%I', tablename), ', ') || ' RESTART IDENTITY CASCADE'
    FROM pg_tables WHERE schemaname = 'public'
  );
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'test_seed' LOOP
    EXECUTE format('INSERT INTO public.%I SELECT * FROM test_seed.%I', t, t);
  END LOOP;
END $$;
`;

// Every database this test file created.
const created = new Set<TestDb>();

// Vitest gives each test file its own copy of this module, so this hook runs
// before every test in each file that imports it: no test sees rows another
// one left, and a new test file gets that without asking.
beforeEach(async () => {
  for (const db of created) await resetTestDb(db);
});

export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  await client.exec(SNAPSHOT);
  created.add(db);
  return db;
}

// Puts the database back as the migrations left it.
export async function resetTestDb(db: TestDb) {
  await db.$client.exec("SELECT test_seed.reset()");
}
