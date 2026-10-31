import "server-only";
import { and, eq, isNull, sql, TransactionRollbackError } from "drizzle-orm";
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
  if (await deleteUnlessBlocked(db, table, id)) return "deleted";
  await archive(db, table, id);
  return "archived";
}

// What Remove would do right now. It tries the delete and rolls it back, so
// the answer comes from the same foreign keys Remove runs into.
export async function removeOutcome(db: Db, table: ArchivableTable, id: string): Promise<RemoveOutcome> {
  try {
    await db.transaction(async (tx) => {
      await tx.delete(table).where(eq(table.id, id));
      tx.rollback();
    });
  } catch (error) {
    if (error instanceof TransactionRollbackError) return "deleted";
    if (isBlockedByReference(error)) return "archived";
    throw error;
  }
  throw new Error("The delete was not rolled back");
}

// Remove, but only if it would still do what the viewer was told. Otherwise
// nothing changes and it returns false.
export async function removeIfStill(
  db: Db,
  table: ArchivableTable,
  id: string,
  expected: RemoveOutcome,
): Promise<boolean> {
  if (expected === "deleted") return deleteUnlessBlocked(db, table, id);
  if ((await removeOutcome(db, table, id)) === "deleted") return false;
  await archive(db, table, id);
  return true;
}

async function deleteUnlessBlocked(db: Db, table: ArchivableTable, id: string): Promise<boolean> {
  try {
    await db.delete(table).where(eq(table.id, id));
    return true;
  } catch (error) {
    if (!isBlockedByReference(error)) throw error;
    return false;
  }
}

async function archive(db: Db, table: ArchivableTable, id: string): Promise<void> {
  await db
    .update(table)
    .set({ archivedAt: sql`now()` })
    .where(and(eq(table.id, id), isNull(table.archivedAt)));
}
