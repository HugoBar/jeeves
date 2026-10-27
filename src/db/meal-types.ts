import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "./index";
import { mealTypes } from "./schema";

export type MealType = typeof mealTypes.$inferSelect;

export function listMealTypes(db: Db): Promise<MealType[]> {
  return db.select().from(mealTypes);
}

export async function getMealType(db: Db, id: string): Promise<MealType | undefined> {
  const [mealType] = await db.select().from(mealTypes).where(eq(mealTypes.id, id));
  return mealType;
}

// A seeded Meal Type keeps its key; a stored name overrides the key's string.
export async function updateMealType(
  db: Db,
  id: string,
  changes: { name: string | null; priority: number; allowsLeftovers: boolean },
): Promise<void> {
  await db.update(mealTypes).set(changes).where(eq(mealTypes.id, id));
}
