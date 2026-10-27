const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Postgres rejects a malformed uuid outright, so ids from a request are
// checked first: a page treats a malformed one as a missing page, not an
// error, and a saved link to one names nothing.
export function isUuid(id: string): boolean {
  return UUID.test(id);
}
