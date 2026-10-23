const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Postgres rejects a malformed uuid outright, so pages check the id first and
// treat a malformed one as a missing page, not an error.
export function isUuid(id: string): boolean {
  return UUID.test(id);
}
