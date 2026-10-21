import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// The core import boundary (ADR 0001) is enforced by ESLint; this proves the
// rule is actually active for files in src/core.
const eslint = new ESLint();

async function boundaryErrors(source: string, filePath = "src/core/example.ts") {
  const [result] = await eslint.lintText(source, { filePath });
  return (result?.messages ?? []).filter((m) => m.ruleId === "no-restricted-imports");
}

describe("core import boundary", () => {
  it.each([
    ['import { NextResponse } from "next/server";'],
    ['import { useState } from "react";'],
    ['import { sql } from "drizzle-orm";'],
    ['import { getDb } from "@/db";'],
    ['import { t } from "../strings";'],
    ['import { x } from "../lib/x";'],
  ])("rejects %s", async (source) => {
    expect(await boundaryErrors(`${source}\nexport {};\n`)).toHaveLength(1);
  });

  it("applies to .tsx files in core", async () => {
    const source = 'import { useState } from "react";\nexport {};\n';
    expect(await boundaryErrors(source, "src/core/example.tsx")).toHaveLength(1);
  });

  it("rejects relative imports that climb out of a nested core folder", async () => {
    const source = 'import { getDb } from "../../db";\nexport {};\n';
    expect(await boundaryErrors(source, "src/core/units/example.ts")).toHaveLength(1);
  });

  it("allows imports from core itself", async () => {
    expect(await boundaryErrors('import { x } from "@/core/units";\nexport {};\n')).toHaveLength(0);
  });
}, 60_000);
