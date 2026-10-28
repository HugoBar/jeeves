import "server-only";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { MealChanges, MealStatus, NewMealFields } from "@/core/meals";
import type { Db } from "./index";
import type { MealType } from "./meal-types";
import { meals, mealTypes } from "./schema";

// A Meal as the planner shows it, with what its card needs of its Meal Type.
// That Meal Type may be Archived: the Meal keeps it.
export interface Meal extends NewMealFields {
  id: string;
  createdAt: Date;
  status: MealStatus;
  untracked: boolean;
  mealType: Pick<MealType, "seedKey" | "name"> & { archived: boolean };
}

function selectMeals(db: Db) {
  return db
    .select({
      id: meals.id,
      createdAt: meals.createdAt,
      date: meals.date,
      hour: meals.hour,
      name: meals.name,
      mealTypeId: meals.mealTypeId,
      status: meals.status,
      untracked: meals.untracked,
      mealType: {
        seedKey: mealTypes.seedKey,
        name: mealTypes.name,
        archived: sql<boolean>`${mealTypes.archivedAt} is not null`,
      },
    })
    .from(meals)
    .innerJoin(mealTypes, eq(meals.mealTypeId, mealTypes.id));
}

// Postgres reads a `time` back as "HH:MM:SS"; core works in "HH:MM".
function withShortHour<T extends { hour: string }>(row: T): T {
  return { ...row, hour: row.hour.slice(0, 5) };
}

// Every Meal from `from` to `to`, both included, in no order.
export async function listMeals(db: Db, from: string, to: string): Promise<Meal[]> {
  const rows = await selectMeals(db).where(and(gte(meals.date, from), lte(meals.date, to)));
  return rows.map(withShortHour);
}

export async function getMeal(db: Db, id: string): Promise<Meal | undefined> {
  const [row] = await selectMeals(db).where(eq(meals.id, id));
  return row && withShortHour(row);
}

// A Meal made from scratch: Planned, tracked, with no Meal Slots.
export async function createMeal(db: Db, fields: NewMealFields): Promise<{ id: string }> {
  const [row] = await db.insert(meals).values(fields).returning({ id: meals.id });
  return row!;
}

// Its Meal Type never changes.
export async function updateMeal(db: Db, id: string, changes: MealChanges): Promise<void> {
  await db.update(meals).set(changes).where(eq(meals.id, id));
}

export async function setMealUntracked(db: Db, id: string, untracked: boolean): Promise<void> {
  await db.update(meals).set({ untracked }).where(eq(meals.id, id));
}

// Nothing refers to a Meal yet, so it is a plain hard delete.
export async function deleteMeal(db: Db, id: string): Promise<void> {
  await db.delete(meals).where(eq(meals.id, id));
}
