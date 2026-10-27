import "server-only";
import { eq } from "drizzle-orm";
import type { MealTemplateFields } from "@/core/meal-templates";
import type { Db } from "./index";
import { mealTemplates } from "./schema";

export interface MealTemplate extends MealTemplateFields {
  id: string;
}

type StoredMealTemplate = typeof mealTemplates.$inferSelect;

// Postgres reads a `time` back as "HH:MM:SS"; core works in "HH:MM".
function toMealTemplate({ id, name, hour, mealTypeId }: StoredMealTemplate): MealTemplate {
  return { id, name, hour: hour.slice(0, 5), mealTypeId };
}

export async function listMealTemplates(db: Db): Promise<MealTemplate[]> {
  const rows = await db.select().from(mealTemplates);
  return rows.map(toMealTemplate);
}

export async function getMealTemplate(db: Db, id: string): Promise<MealTemplate | undefined> {
  const [row] = await db.select().from(mealTemplates).where(eq(mealTemplates.id, id));
  return row && toMealTemplate(row);
}

export async function createMealTemplate(db: Db, fields: MealTemplateFields): Promise<MealTemplate> {
  const [row] = await db.insert(mealTemplates).values(fields).returning();
  return toMealTemplate(row!);
}

export async function updateMealTemplate(db: Db, id: string, changes: MealTemplateFields): Promise<void> {
  await db.update(mealTemplates).set(changes).where(eq(mealTemplates.id, id));
}

// Nothing refers to a template, so it is always hard deleted, never Archived.
export async function deleteMealTemplate(db: Db, id: string): Promise<void> {
  await db.delete(mealTemplates).where(eq(mealTemplates.id, id));
}
