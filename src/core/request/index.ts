import { isDate } from "@/core/planner";
import { isUuid } from "@/core/uuid";

// What a server action is sent comes from the browser, which anyone can
// craft. Each action checks its shape with these before touching the
// database, and refuses anything else with this error: the app's own pages
// never send it, so it is never shown to someone using them.
export class MalformedRequest extends Error {
  constructor(what: string) {
    super(`Malformed request: expected ${what}`);
  }
}

export function requireUuid(value: unknown): string {
  if (typeof value !== "string" || !isUuid(value)) throw new MalformedRequest("an id");
  return value;
}

// A picker's id, or blank when nothing was picked, which its form reports.
export function requireUuidOrBlank(value: unknown): string {
  return value === "" ? "" : requireUuid(value);
}

export function requireDate(value: unknown): string {
  if (typeof value !== "string" || !isDate(value)) throw new MalformedRequest("a date");
  return value;
}

export function requireBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new MalformedRequest("true or false");
  return value;
}

// Text, as a form field or an argument sends it. A field not sent reads as
// blank, as FormData.get gives null for it; a file in its place is refused.
export function requireText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string") throw new MalformedRequest("text");
  return value;
}

export function requireOneOf<T extends string>(value: unknown, options: readonly T[]): T {
  const found = options.find((option) => option === value);
  if (found === undefined) throw new MalformedRequest(`one of ${options.join(", ")}`);
  return found;
}

// A number from 0 to `max`, the most its column holds; `whole` for one stored
// as a whole number.
export function requireNumber(value: unknown, { max, whole = false }: { max: number; whole?: boolean }): number {
  if (typeof value !== "number" || !(value >= 0 && value <= max) || (whole && !Number.isInteger(value))) {
    throw new MalformedRequest(whole ? "a whole number" : "a number");
  }
  return value;
}

// A list, each item checked by `each`.
export function requireList<T>(value: unknown, each: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new MalformedRequest("a list");
  return value.map(each);
}

// An object, whose fields the caller checks.
export function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new MalformedRequest("an object");
  return value as Record<string, unknown>;
}
