// The SQLSTATE of a failed query, or undefined if the error did not come from
// Postgres. Drizzle wraps the driver's error in `cause`.
export function postgresErrorCode(error: unknown): string | undefined {
  const cause = error instanceof Error ? error.cause : undefined;
  return typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string"
    ? cause.code
    : undefined;
}

// Postgres raises 23001 for ON DELETE RESTRICT and 23503 for NO ACTION.
export function isBlockedByReference(error: unknown): boolean {
  const code = postgresErrorCode(error);
  return code === "23001" || code === "23503";
}
