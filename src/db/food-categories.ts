import "server-only";
import { eq, isNull, sql } from "drizzle-orm";
import type { CategoryKind } from "@/core/food-categories";
import type { Db } from "./index";
import { isBlockedByReference } from "./postgres-errors";
import { foodCategories } from "./schema";

export type FoodCategory = typeof foodCategories.$inferSelect;

// What pickers offer: every category that is not Archived.
export function listActiveCategories(db: Db): Promise<FoodCategory[]> {
  return db.select().from(foodCategories).where(isNull(foodCategories.archivedAt));
}

export async function createCategory(
  db: Db,
  input: { name: string; kind: CategoryKind },
): Promise<FoodCategory> {
  const [category] = await db.insert(foodCategories).values(input).returning();
  return category!;
}

export async function getCategory(db: Db, id: string): Promise<FoodCategory | undefined> {
  const [category] = await db.select().from(foodCategories).where(eq(foodCategories.id, id));
  return category;
}

// A seeded category keeps its key; a stored name overrides the key's string.
export async function updateCategory(
  db: Db,
  id: string,
  changes: { name: string | null; kind: CategoryKind },
): Promise<void> {
  await db.update(foodCategories).set(changes).where(eq(foodCategories.id, id));
}

// "Remove" Archives a category in use; hard delete only when unreferenced.
// "In use" is whatever a foreign key says, so new referencing tables need no
// change here as long as they use ON DELETE RESTRICT.
export async function removeCategory(db: Db, id: string): Promise<"deleted" | "archived"> {
  try {
    await db.delete(foodCategories).where(eq(foodCategories.id, id));
    return "deleted";
  } catch (error) {
    if (!isBlockedByReference(error)) throw error;
    await db.update(foodCategories).set({ archivedAt: sql`now()` }).where(eq(foodCategories.id, id));
    return "archived";
  }
}
