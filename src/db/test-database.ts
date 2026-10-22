// Vitest global setup for the "db" project: recreates a `<name>_test` database
// next to DATABASE_URL's, applies every migration and hands its URL to tests.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

export default async function setup(project: TestProject) {
  try {
    process.loadEnvFile();
  } catch {
    // No .env: DATABASE_URL must come from the environment.
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set; database tests need Postgres (pnpm db:up)");

  const testUrl = new URL(url);
  const testName = `${testUrl.pathname.slice(1)}_test`;
  testUrl.pathname = `/${testName}`;

  const admin = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`DROP DATABASE IF EXISTS "${testName}" WITH (FORCE)`);
    await admin.unsafe(`CREATE DATABASE "${testName}"`);
  } finally {
    await admin.end();
  }

  const client = postgres(testUrl.href, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  } finally {
    await client.end();
  }

  project.provide("testDatabaseUrl", testUrl.href);
}
