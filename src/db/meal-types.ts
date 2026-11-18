import "server-only";
import { eq, isNull, sql } from "drizzle-orm";
import type { MealTypeFields } from "@/core/meal-types";
import { deleteOrArchive, type RemoveOutcome } from "./archive";
import type { Db } from "./index";
import { meals, mealTypes } from "./schema";

export type MealType = typeof mealTypes.$inferSelect;

// What the Meal Types page lists: every Meal Type that is not Archived.
export function listActiveMealTypes(db: Db): Promise<MealType[]> {
  return db.select().from(mealTypes).where(isNull(mealTypes.archivedAt));
}

// Each Meal Type's Meal Priority, Archived ones included, by id.
export async function listMealTypePriorities(db: Db): Promise<Map<string, number>> {
  const rows = await db.select({ id: mealTypes.id, priority: mealTypes.priority }).from(mealTypes);
  return new Map(rows.map(({ id, priority }) => [id, priority]));
}

// Each Meal Type's usual hour, by id: the median hour of all its Meals,
// whatever their status, in minutes after midnight. A Meal Type with no Meals
// is left out; Meal Templates don't count.
export async function listMealTypeUsualMinutes(db: Db): Promise<Map<string, number>> {
  const rows = await db
    .select({
      id: meals.mealTypeId,
      minutes: sql<number>`percentile_cont(0.5) within group (order by extract(epoch from ${meals.hour}) / 60)`.mapWith(
        Number,
      ),
    })
    .from(meals)
    .groupBy(meals.mealTypeId);
  return new Map(rows.map(({ id, minutes }) => [id, minutes]));
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

// A Meal Type a Meal or Meal Template uses is only Archived; they keep it.
export function removeMealType(db: Db, id: string): Promise<RemoveOutcome> {
  return deleteOrArchive(db, mealTypes, id);
}
