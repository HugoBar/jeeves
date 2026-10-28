"use server";

import { refresh } from "next/cache";
import {
  parseMealChanges,
  parseMealSlotCategory,
  parseMealSlotFill,
  parseNewMeal,
  parseNewMealFromTemplate,
  pickableForSlot,
  type MealFieldError,
  type MealFromTemplateError,
  type MealSlotCategoryError,
  type MealSlotFillError,
  type NewMealInput,
} from "@/core/meals";
import { getDb } from "@/db";
import { listActiveCategories } from "@/db/food-categories";
import { listMealTemplates } from "@/db/meal-templates";
import { listActiveMealTypes } from "@/db/meal-types";
import {
  createMeal,
  createMealFromTemplate,
  deleteMeal,
  fillMealSlot,
  getMeal,
  getMealSlotContext,
  listFoodsForSlots,
  setMealSlotCategory,
  setMealUntracked,
  updateMeal,
} from "@/db/meals";

// `values` refills the form after a rejected submit, which React resets.
export type NewMealFormValues = Omit<NewMealInput, "date">;
export type NewMealFormState = { errors: MealFieldError[]; values: NewMealFormValues };
export type MealChangesFormValues = Pick<NewMealInput, "hour" | "name">;
export type MealChangesFormState = { errors: MealFieldError[]; values: MealChangesFormValues };
export type MealFromTemplateFormState = { errors: MealFromTemplateError[]; templateId: string };
export type MealSlotCategoryFormState = { error: MealSlotCategoryError | null };
export type MealSlotFillFormState = { error: MealSlotFillError | null };

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

// `date` is the planner day the form was opened on. Any Meal Template can be
// used, even one whose Meal Type is Archived: the Meal keeps it, as the
// template does.
export async function createMealFromTemplateAction(
  date: string,
  _state: MealFromTemplateFormState,
  formData: FormData,
): Promise<MealFromTemplateFormState> {
  const db = getDb();
  const templates = new Set((await listMealTemplates(db)).map((template) => template.id));
  const templateId = String(formData.get("templateId") ?? "");
  const parsed = parseNewMealFromTemplate({ date, templateId }, templates);
  if (!parsed.ok) return { errors: parsed.errors, templateId };
  // Deleted after it was checked.
  if (!(await createMealFromTemplate(db, parsed.fields))) return { errors: ["unavailableMealTemplate"], templateId };
  refresh();
  return { errors: [], templateId: "" };
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

// A slot can only be changed to a Food Category that is not Archived.
export async function setMealSlotCategoryAction(
  slotId: string,
  _state: MealSlotCategoryFormState,
  formData: FormData,
): Promise<MealSlotCategoryFormState> {
  const db = getDb();
  const pickable = new Set((await listActiveCategories(db)).map((category) => category.id));
  const parsed = parseMealSlotCategory(String(formData.get("slotCategoryId") ?? ""), pickable);
  if (!parsed.ok) return { error: parsed.error };
  await setMealSlotCategory(db, slotId, parsed.slotCategoryId);
  refresh();
  return { error: null };
}

// A slot can only be filled with what its picker offers: a non-Archived
// Recipe or Product carrying its Slot Category, or Leftovers if its Meal Type
// allows them.
export async function fillMealSlotAction(
  slotId: string,
  _state: MealSlotFillFormState,
  formData: FormData,
): Promise<MealSlotFillFormState> {
  const db = getDb();
  const slot = await getMealSlotContext(db, slotId);
  if (!slot) throw new Error("Meal Slot not found");
  const { recipes, products } = await listFoodsForSlots(db);
  const ids = (foods: { id: string }[]) => new Set(foods.map((food) => food.id));
  const parsed = parseMealSlotFill(
    { food: String(formData.get("food") ?? ""), amount: String(formData.get("amount") ?? "") },
    {
      recipeIds: ids(pickableForSlot(recipes, slot.slotCategoryId)),
      productIds: ids(pickableForSlot(products, slot.slotCategoryId)),
      allowsLeftovers: slot.allowsLeftovers,
    },
  );
  if (!parsed.ok) return { error: parsed.error };
  await fillMealSlot(db, slotId, parsed.fill);
  refresh();
  return { error: null };
}

export async function emptyMealSlotAction(slotId: string): Promise<void> {
  await fillMealSlot(getDb(), slotId, { content: "empty" });
  refresh();
}

export async function setMealUntrackedAction(id: string, untracked: boolean): Promise<void> {
  await setMealUntracked(getDb(), id, untracked);
  refresh();
}

export async function removeMealAction(id: string): Promise<void> {
  await deleteMeal(getDb(), id);
  refresh();
}
