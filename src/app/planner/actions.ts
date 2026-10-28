"use server";

import { refresh } from "next/cache";
import { parseMealChanges, parseNewMeal, type MealFieldError, type NewMealInput } from "@/core/meals";
import { getDb } from "@/db";
import { listActiveMealTypes } from "@/db/meal-types";
import { createMeal, deleteMeal, getMeal, setMealUntracked, updateMeal } from "@/db/meals";

// `values` refills the form after a rejected submit, which React resets.
export type NewMealFormValues = Omit<NewMealInput, "date">;
export type NewMealFormState = { errors: MealFieldError[]; values: NewMealFormValues };
export type MealChangesFormValues = Pick<NewMealInput, "hour" | "name">;
export type MealChangesFormState = { errors: MealFieldError[]; values: MealChangesFormValues };

// `date` is the planner day the form was opened on.
export async function createMealAction(
  date: string,
  _state: NewMealFormState,
  formData: FormData,
): Promise<NewMealFormState> {
  const db = getDb();
  // A new Meal can only have a Meal Type that is not Archived.
  const pickable = new Set((await listActiveMealTypes(db)).map((mealType) => mealType.id));
  const values = {
    mealTypeId: String(formData.get("mealTypeId") ?? ""),
    hour: String(formData.get("hour") ?? ""),
    name: String(formData.get("name") ?? ""),
  };
  const parsed = parseNewMeal({ date, ...values }, pickable);
  if (!parsed.ok) return { errors: parsed.errors, values };
  await createMeal(db, parsed.fields);
  refresh();
  return { errors: [], values: { mealTypeId: "", hour: "", name: "" } };
}

export async function editMealAction(
  id: string,
  _state: MealChangesFormState,
  formData: FormData,
): Promise<MealChangesFormState> {
  const db = getDb();
  if (!(await getMeal(db, id))) throw new Error("Meal not found");
  const values = { hour: String(formData.get("hour") ?? ""), name: String(formData.get("name") ?? "") };
  const parsed = parseMealChanges(values);
  if (!parsed.ok) return { errors: parsed.errors, values };
  await updateMeal(db, id, parsed.changes);
  refresh();
  return { errors: [], values };
}

export async function setMealUntrackedAction(id: string, untracked: boolean): Promise<void> {
  await setMealUntracked(getDb(), id, untracked);
  refresh();
}

export async function removeMealAction(id: string): Promise<void> {
  await deleteMeal(getDb(), id);
  refresh();
}
