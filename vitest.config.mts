import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Only Next.js's server bundle may import "server-only"; tests run on the server too.
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["src/**/*.test.ts"], exclude: ["src/**/*.db.test.ts"] },
      },
      {
        // Needs Postgres at DATABASE_URL (pnpm db:up); see src/db/test-database.ts.
        extends: true,
        test: {
          name: "db",
          include: ["src/**/*.db.test.ts"],
          globalSetup: ["./src/db/test-database.ts"],
        },
      },
    ],
  },
});
