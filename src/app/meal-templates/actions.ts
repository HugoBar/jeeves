"use server";

import { refresh } from "next/cache";
import { parseMealTemplateFields, type MealTemplateFieldError } from "@/core/meal-templates";
import { getDb } from "@/db";
import { createMealTemplate, deleteMealTemplate, getMealTemplate, updateMealTemplate } from "@/db/meal-templates";

export type MealTemplateFormState = { errors: MealTemplateFieldError[] };

export async function createMealTemplateAction(
  _state: MealTemplateFormState,
  formData: FormData,
): Promise<MealTemplateFormState> {
  const parsed = parseMealTemplateFields(fieldsFrom(formData));
  if (!parsed.ok) return { errors: parsed.errors };
  await createMealTemplate(getDb(), parsed.fields);
  refresh();
  return { errors: [] };
}

export async function editMealTemplateAction(
  id: string,
  _state: MealTemplateFormState,
  formData: FormData,
): Promise<MealTemplateFormState> {
  const parsed = parseMealTemplateFields(fieldsFrom(formData));
  if (!parsed.ok) return { errors: parsed.errors };
  const db = getDb();
  if (!(await getMealTemplate(db, id))) throw new Error("Meal Template not found");
  await updateMealTemplate(db, id, parsed.fields);
  refresh();
  return { errors: [] };
}

export async function removeMealTemplateAction(id: string): Promise<void> {
  await deleteMealTemplate(getDb(), id);
  refresh();
}

function fieldsFrom(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    hour: String(formData.get("hour") ?? ""),
    mealTypeId: String(formData.get("mealTypeId") ?? ""),
  };
}
