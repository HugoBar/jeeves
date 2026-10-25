import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Db } from "./index";
import { isBlockedByReference } from "./postgres-errors";

// A table whose rows can be Archived instead of deleted.
type ArchivableTable = PgTable & { id: PgColumn; archivedAt: PgColumn };

export type RemoveOutcome = "deleted" | "archived";

// "Remove" hard deletes a row nothing refers to and Archives it otherwise.
// "Refers to" is whatever a foreign key says, so new referencing tables need no
// change here as long as they use ON DELETE RESTRICT. An already Archived row
// keeps its original Archive time.
export async function deleteOrArchive(db: Db, table: ArchivableTable, id: string): Promise<RemoveOutcome> {
  try {
    await db.delete(table).where(eq(table.id, id));
    return "deleted";
  } catch (error) {
    if (!isBlockedByReference(error)) throw error;
    await db
      .update(table)
      .set({ archivedAt: sql`now()` })
      .where(and(eq(table.id, id), isNull(table.archivedAt)));
    return "archived";
  }
}
