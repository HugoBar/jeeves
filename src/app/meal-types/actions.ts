"use server";

import { refresh } from "next/cache";
import { parseMealTypeFields, type MealTypeFieldError } from "@/core/meal-types";
import { getDb } from "@/db";
import { getMealType, updateMealType } from "@/db/meal-types";
import { mealTypeLabel } from "@/strings";

export type MealTypeFormState = { errors: MealTypeFieldError[] };

export async function editMealTypeAction(
  id: string,
  _state: MealTypeFormState,
  formData: FormData,
): Promise<MealTypeFormState> {
  const parsed = parseMealTypeFields({
    name: String(formData.get("name") ?? ""),
    priority: String(formData.get("priority") ?? ""),
    allowsLeftovers: formData.get("allowsLeftovers") !== null,
  });
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
