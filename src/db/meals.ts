import "server-only";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { MealChanges, MealSlotContent, MealStatus, NewMealFields, NewMealFromTemplateFields } from "@/core/meals";
import type { FoodCategory } from "./food-categories";
import type { Db } from "./index";
import { getMealTemplate } from "./meal-templates";
import type { MealType } from "./meal-types";
import { foodCategories, mealSlots, meals, mealTypes } from "./schema";

// A Meal Slot with what its card needs of its Slot Category. That category
// may be Archived: the slot keeps it until it is changed.
export interface MealSlot {
  id: string;
  slotCategoryId: string;
  content: MealSlotContent;
  slotCategory: Pick<FoodCategory, "seedKey" | "name"> & { archived: boolean };
}

// A Meal as the planner shows it, with what its card needs of its Meal Type
// and its slots in order. That Meal Type may be Archived: the Meal keeps it.
export interface Meal extends NewMealFields {
  id: string;
  createdAt: Date;
  status: MealStatus;
  untracked: boolean;
  mealType: Pick<MealType, "seedKey" | "name"> & { archived: boolean };
  slots: MealSlot[];
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

// Each Meal's slots in order, by Meal id.
async function slotsByMeal(db: Db, mealIds: string[]): Promise<Map<string, MealSlot[]>> {
  const byMeal = new Map<string, MealSlot[]>(mealIds.map((id) => [id, []]));
  if (mealIds.length === 0) return byMeal;
  const rows = await db
    .select({
      mealId: mealSlots.mealId,
      id: mealSlots.id,
      slotCategoryId: mealSlots.slotCategoryId,
      content: mealSlots.content,
      slotCategory: {
        seedKey: foodCategories.seedKey,
        name: foodCategories.name,
        archived: sql<boolean>`${foodCategories.archivedAt} is not null`,
      },
    })
    .from(mealSlots)
    .innerJoin(foodCategories, eq(mealSlots.slotCategoryId, foodCategories.id))
    .where(inArray(mealSlots.mealId, mealIds))
    .orderBy(asc(mealSlots.position));
  for (const { mealId, ...slot } of rows) byMeal.get(mealId)!.push(slot);
  return byMeal;
}

// Rows with their slots added. Postgres reads a `time` back as "HH:MM:SS";
// core works in "HH:MM".
async function toMeals(db: Db, rows: Omit<Meal, "slots">[]): Promise<Meal[]> {
  const slots = await slotsByMeal(db, rows.map((row) => row.id));
  return rows.map((row) => ({ ...row, hour: row.hour.slice(0, 5), slots: slots.get(row.id)! }));
}

// Every Meal from `from` to `to`, both included, in no order.
export async function listMeals(db: Db, from: string, to: string): Promise<Meal[]> {
  return toMeals(db, await selectMeals(db).where(and(gte(meals.date, from), lte(meals.date, to))));
}

export async function getMeal(db: Db, id: string): Promise<Meal | undefined> {
  const [meal] = await toMeals(db, await selectMeals(db).where(eq(meals.id, id)));
  return meal;
}

// A Meal made from scratch: Planned, tracked, with no Meal Slots.
export async function createMeal(db: Db, fields: NewMealFields): Promise<{ id: string }> {
  const [row] = await db.insert(meals).values(fields).returning({ id: meals.id });
  return row!;
}

// Copies the template's name, Meal Type, hour and slots, each empty with the
// template slot's Slot Category, in order. The Meal keeps no link to the
// template (data-model Q5). Undefined if the template is gone.
export async function createMealFromTemplate(
  db: Db,
  { date, templateId }: NewMealFromTemplateFields,
): Promise<{ id: string } | undefined> {
  return db.transaction(async (tx) => {
    const template = await getMealTemplate(tx, templateId);
    if (!template) return undefined;
    const { name, hour, mealTypeId, slotCategoryIds } = template;
    const meal = await createMeal(tx, { date, hour, name, mealTypeId });
    if (slotCategoryIds.length > 0) {
      await tx
        .insert(mealSlots)
        .values(slotCategoryIds.map((slotCategoryId, position) => ({ mealId: meal.id, slotCategoryId, position })));
    }
    return meal;
  });
}

// Its Meal Type never changes.
export async function updateMeal(db: Db, id: string, changes: MealChanges): Promise<void> {
  await db.update(meals).set(changes).where(eq(meals.id, id));
}

// The Slot Category must already be checked by core's parseMealSlotCategory.
export async function setMealSlotCategory(db: Db, slotId: string, slotCategoryId: string): Promise<void> {
  await db.update(mealSlots).set({ slotCategoryId }).where(eq(mealSlots.id, slotId));
}

export async function setMealUntracked(db: Db, id: string, untracked: boolean): Promise<void> {
  await db.update(meals).set({ untracked }).where(eq(meals.id, id));
}

// Nothing refers to a Meal yet, so it is a plain hard delete. Its own slots
// cascade.
export async function deleteMeal(db: Db, id: string): Promise<void> {
  await db.delete(meals).where(eq(meals.id, id));
}
