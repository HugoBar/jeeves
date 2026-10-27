"use server";

import { refresh } from "next/cache";
import { parseMealTypeFields, type MealTypeFieldError } from "@/core/meal-types";
import { getDb } from "@/db";
import { createMealType, getMealType, removeMealType, updateMealType } from "@/db/meal-types";
import { mealTypeLabel } from "@/strings";

export type MealTypeFormState = { errors: MealTypeFieldError[] };

export async function createMealTypeAction(
  _state: MealTypeFormState,
  formData: FormData,
): Promise<MealTypeFormState> {
  const parsed = parseMealTypeForm(formData);
  if (!parsed.ok) return { errors: parsed.errors };
  await createMealType(getDb(), parsed.fields);
  refresh();
  return { errors: [] };
}

export async function editMealTypeAction(
  id: string,
  _state: MealTypeFormState,
  formData: FormData,
): Promise<MealTypeFormState> {
  const parsed = parseMealTypeForm(formData);
  if (!parsed.ok) return { errors: parsed.errors };
  const db = getDb();
  const mealType = await getMealType(db, id);
  if (!mealType) throw new Error("Meal Type not found");
  // The form starts with the shown label, so an untouched name is no rename and
  // a seeded Meal Type keeps following its key's string.
  const name = parsed.fields.name === mealTypeLabel(mealType) ? mealType.name : parsed.fields.name;
  await updateMealType(db, id, { ...parsed.fields, name });
  refresh();
  return { errors: [] };
}

export async function removeMealTypeAction(id: string): Promise<void> {
  await removeMealType(getDb(), id);
  refresh();
}

function parseMealTypeForm(formData: FormData) {
  return parseMealTypeFields({
    name: String(formData.get("name") ?? ""),
    priority: String(formData.get("priority") ?? ""),
    allowsLeftovers: formData.get("allowsLeftovers") !== null,
  });
}
