import "server-only";
import { eq, isNull } from "drizzle-orm";
import type { MealTypeFields } from "@/core/meal-types";
import { deleteOrArchive, type RemoveOutcome } from "./archive";
import type { Db } from "./index";
import { mealTypes } from "./schema";

export type MealType = typeof mealTypes.$inferSelect;

// What the Meal Types page lists: every Meal Type that is not Archived.
export function listActiveMealTypes(db: Db): Promise<MealType[]> {
  return db.select().from(mealTypes).where(isNull(mealTypes.archivedAt));
}

export async function getMealType(db: Db, id: string): Promise<MealType | undefined> {
  const [mealType] = await db.select().from(mealTypes).where(eq(mealTypes.id, id));
  return mealType;
}

export async function createMealType(db: Db, fields: MealTypeFields): Promise<MealType> {
  const [mealType] = await db.insert(mealTypes).values(fields).returning();
  return mealType!;
}

// A seeded Meal Type keeps its key; a stored name overrides the key's string.
export async function updateMealType(
  db: Db,
  id: string,
  changes: { name: string | null; priority: number; allowsLeftovers: boolean },
): Promise<void> {
  await db.update(mealTypes).set(changes).where(eq(mealTypes.id, id));
}

// A Meal Type a Meal Template uses is only Archived; the template keeps it.
export function removeMealType(db: Db, id: string): Promise<RemoveOutcome> {
  return deleteOrArchive(db, mealTypes, id);
}
