import { describe, expect, it } from "vitest";
import { isDatabaseUnreachable } from "./postgres-errors";

// A Drizzle query error: the driver's error is its `cause`.
const wrapped = (code: string) => new Error("Failed query: select 1", { cause: Object.assign(new Error("driver"), { code }) });
const unwrapped = (code: string) => Object.assign(new Error("connect"), { code });

describe("isDatabaseUnreachable", () => {
  it.each(["ECONNREFUSED", "CONNECT_TIMEOUT", "CONNECTION_CLOSED", "ENOTFOUND"])("is true for the driver's %s", (code) => {
    expect(isDatabaseUnreachable(wrapped(code))).toBe(true);
    expect(isDatabaseUnreachable(unwrapped(code))).toBe(true);
  });

  it.each(["08006", "28P01", "57P03", "3D000"])("is true when Postgres refuses the connection with %s", (code) => {
    expect(isDatabaseUnreachable(wrapped(code))).toBe(true);
  });

  it.each(["23505", "22003", "42P01"])("is false for a query Postgres ran and rejected (%s)", (code) => {
    expect(isDatabaseUnreachable(wrapped(code))).toBe(false);
  });

  it("is false for an error with no code, or no error at all", () => {
    expect(isDatabaseUnreachable(new Error("boom"))).toBe(false);
    expect(isDatabaseUnreachable(undefined)).toBe(false);
    expect(isDatabaseUnreachable("ECONNREFUSED")).toBe(false);
  });
});
