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

export function isUniqueViolation(error: unknown): boolean {
  return postgresErrorCode(error) === "23505";
}

// Codes for a database Jeeves cannot get to: the driver's own (postgres-js and
// Node's socket errors), and Postgres refusing the connection.
const UNREACHABLE_CODES = new Set([
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
  // Shutting down, starting up, or the database named in the address is missing.
  "57P01",
  "57P02",
  "57P03",
  "3D000",
]);

function ownCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

// Whether a failed query failed because the database could not be reached or
// would not let Jeeves in, rather than because of the query. Drizzle wraps the
// driver's error in `cause`; a connection error can also come unwrapped.
export function isDatabaseUnreachable(error: unknown): boolean {
  return [postgresErrorCode(error), ownCode(error)].some(
    // Class 08 is a connection exception, class 28 a refused login.
    (code) => code !== undefined && (UNREACHABLE_CODES.has(code) || /^(08|28)[0-9A-Z]{3}$/.test(code)),
  );
}
