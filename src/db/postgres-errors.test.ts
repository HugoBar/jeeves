import { describe, expect, it } from "vitest";
import { isDatabaseUnreachable } from "./postgres-errors";

// A Drizzle query error: the driver's error is its `cause`.
const wrapped = (code: string) => new Error("Failed query: select 1", { cause: Object.assign(new Error("driver"), { code }) });
const unwrapped = (code: string) => Object.assign(new Error("connect"), { code });

describe("isDatabaseUnreachable", () => {
  it.each([
    "ECONNREFUSED",
    "ECONNRESET",
    "ETIMEDOUT",
    "EHOSTUNREACH",
    "ENETUNREACH",
    "ENOTFOUND",
    "EAI_AGAIN",
    "CONNECT_TIMEOUT",
    "CONNECTION_CLOSED",
    "CONNECTION_ENDED",
    "CONNECTION_DESTROYED",
  ])("is true for the driver's %s", (code) => {
    expect(isDatabaseUnreachable(wrapped(code))).toBe(true);
    expect(isDatabaseUnreachable(unwrapped(code))).toBe(true);
  });

  it.each(["57P01", "57P02", "57P03"])("is true while Postgres shuts down or starts up (%s)", (code) => {
    expect(isDatabaseUnreachable(wrapped(code))).toBe(true);
  });

  it("is true when the database named in the address is missing (3D000)", () => {
    expect(isDatabaseUnreachable(wrapped("3D000"))).toBe(true);
  });

  it.each(["08000", "08001", "08006", "08P01"])("is true for any connection exception (%s)", (code) => {
    expect(isDatabaseUnreachable(wrapped(code))).toBe(true);
  });

  it.each(["28000", "28P01"])("is true when Postgres refuses the login (%s)", (code) => {
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
