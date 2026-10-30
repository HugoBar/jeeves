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
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Each database test file starts Postgres and runs every migration, which
    // can pass the default 10 seconds on a busy machine.
    hookTimeout: 60_000,
  },
});
