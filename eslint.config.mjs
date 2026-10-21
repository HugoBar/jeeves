import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "node_modules/**", "drizzle/**", "next-env.d.ts"]),
  {
    // Every user-facing string comes from src/strings (spec: Platform).
    files: ["src/**/*.tsx"],
    rules: {
      "react/jsx-no-literals": ["error", { noStrings: true, ignoreProps: true }],
      // ignoreProps lets className etc. through; these props are read or heard by people.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXAttribute[name.name=/^(alt|title|placeholder|label|aria-label|aria-description|aria-placeholder|aria-roledescription|aria-valuetext)$/] > Literal",
          message: "Use t() from @/strings for user-facing text.",
        },
      ],
    },
  },
  {
    // core stays framework-free so it can be wrapped by another server later (ADR 0001).
    files: ["src/core/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["next", "next/*", "react", "react/*", "react-dom", "react-dom/*"],
              message: "core must not depend on Next.js or React (ADR 0001).",
            },
            {
              group: ["drizzle-orm", "drizzle-orm/*", "postgres"],
              message: "core must not depend on the database (ADR 0001).",
            },
            {
              regex: "^@/(?!core(/|$))",
              message: "core may only import from core.",
            },
            {
              regex: "^\\.\\./",
              message: "Use @/core/... for imports across core folders, so the boundary stays checkable.",
            },
          ],
        },
      ],
    },
  },
]);
