"use server";

import { refresh } from "next/cache";
import { sortCategories } from "@/core/food-categories";
import {
  canChangeMeal,
  parseMealChanges,
  parseMealSlotCategory,
  parseMealSlotFill,
  parseNewMeal,
  parseNewMealFromTemplate,
  parseNewMealSlot,
  parseNewMealSlots,
  newMealSlotPickable,
  pickableForSlot,
  type MealFieldError,
  type MealFromTemplateError,
  type MealSlotCategoryError,
  type MealSlotFillError,
  type NewMealInput,
  type NewMealSlotError,
  type NewMealSlotInput,
  type NewMealSlotPickable,
  type NewMealSlotRowError,
  type NewMealSlotsResult,
} from "@/core/meals";
import { getDb, type Db } from "@/db";
import {
  confirmMeal,
  confirmMealsAsPlanned,
  reopenMeal,
  skipMeal,
  type ConfirmMealResult,
  type RefusedMeal,
} from "@/db/confirmation";
import { listActiveCategories } from "@/db/food-categories";
import { listMealTemplates } from "@/db/meal-templates";
import { listActiveMealTypes } from "@/db/meal-types";
import {
  addMealSlot,
  createMeal,
  createMealFromTemplate,
  deleteMeal,
  fillMealSlot,
  getMeal,
  getMealSlotContext,
  listFoodsForSlots,
  removeMealSlot,
  setMealSlotCategory,
  updateMeal,
} from "@/db/meals";
import { foodCategoryLabel } from "@/strings";

// `values` refills the form after a rejected submit, which React resets. The
// slots are the ones added on the form, before the Meal exists.
export type NewMealFormValues = Omit<NewMealInput, "date"> & { slots: NewMealSlotInput[] };
export type NewMealFormState = { errors: MealFieldError[]; slotErrors: NewMealSlotRowError[]; values: NewMealFormValues };
export type MealChangesFormValues = Pick<NewMealInput, "hour" | "name" | "untracked">;
export type MealChangesFormState = { errors: MealFieldError[]; values: MealChangesFormValues };
export type MealFromTemplateFormState = { errors: MealFromTemplateError[]; templateId: string };
// "notChangeable": the Meal was Confirmed or Skipped since the planner was
// loaded.
export type MealSlotCategoryFormState = { error: MealSlotCategoryError | "notChangeable" | null };
export type MealSlotFillFormState = { error: MealSlotFillError | "notChangeable" | null };
export type NewMealSlotFormState = { error: NewMealSlotError | "notChangeable" | null };
export type ConfirmMealError = Exclude<ConfirmMealResult, { ok: true }>;
export type { RefusedMeal };
// The Meal is gone, already Confirmed or Skipped, or after the viewer's date.
export type SkipMealError = { error: "notSkippable" };

// The slots added on a Meal form before the Meal exists, in the order shown.
// Each sends its food, amount and Slot Category under the same three names.
function newSlotInputs(formData: FormData): NewMealSlotInput[] {
  const all = (name: string) => formData.getAll(name).map(String);
  const [amounts, categories] = [all("slotAmount"), all("slotCategoryId")];
  return all("slotFood").map((food, index) => ({
    food,
    amount: amounts[index] ?? "",
    slotCategoryId: categories[index] ?? "",
  }));
}

// What a slot added by hand can be filled with: every non-Archived Recipe and
// Product, each with the Slot Categories it can give the slot, in the order
// the planner's chooser lists them.
async function newSlotPickable(db: Db): Promise<NewMealSlotPickable> {
  const [{ recipes, products }, active] = await Promise.all([listFoodsForSlots(db), listActiveCategories(db)]);
  return newMealSlotPickable(recipes, products, sortCategories(active, foodCategoryLabel));
}

// Slots added on the Meal form, each checked as one added by hand on the
// planner is.
async function parseFormSlots(db: Db, inputs: NewMealSlotInput[]): Promise<NewMealSlotsResult> {
  if (inputs.length === 0) return { ok: true, slots: [] };
  return parseNewMealSlots(inputs, await newSlotPickable(db));
}

// Runs `write`, which writes the Meal and the slots added on the form. A
// Recipe or Product deleted after they were checked makes it fail, writing
// nothing; checking them again then says which slot it was. Any other
// failure is thrown on.
async function writeWithSlots<T>(
  db: Db,
  inputs: NewMealSlotInput[],
  write: () => Promise<T>,
): Promise<{ ok: true; written: T } | { ok: false; errors: NewMealSlotRowError[] }> {
  try {
    return { ok: true, written: await write() };
  } catch (error) {
    const again = await parseFormSlots(db, inputs);
    if (again.ok) throw error;
    return { ok: false, errors: again.errors };
  }
}

// `date` is the planner day the form was opened on. The Meal and the slots
// added on the form are written together, or not at all.
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
    untracked: formData.get("untracked") === "on",
    slots: newSlotInputs(formData),
  };
  const parsed = parseNewMeal({ date, ...values }, pickable);
  const slots = await parseFormSlots(db, values.slots);
  if (!parsed.ok || !slots.ok) {
    return { errors: parsed.ok ? [] : parsed.errors, slotErrors: slots.ok ? [] : slots.errors, values };
  }
  const written = await writeWithSlots(db, values.slots, () => createMeal(db, parsed.fields, slots.slots));
  if (!written.ok) return { errors: [], slotErrors: written.errors, values };
  refresh();
  return { errors: [], slotErrors: [], values: { mealTypeId: "", hour: "", name: "", untracked: false, slots: [] } };
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
  const values = {
    hour: String(formData.get("hour") ?? ""),
    name: String(formData.get("name") ?? ""),
    untracked: formData.get("untracked") === "on",
  };
  const parsed = parseMealChanges(values);
  if (!parsed.ok) return { errors: parsed.errors, values };
  await updateMeal(db, id, parsed.changes);
  refresh();
  return { errors: [], values };
}

// A slot can only be changed to a Food Category that is not Archived. Every
// slot action changes only the slots of a Planned or Unconfirmed Meal.
export async function setMealSlotCategoryAction(
  slotId: string,
  _state: MealSlotCategoryFormState,
  formData: FormData,
): Promise<MealSlotCategoryFormState> {
  const db = getDb();
  const slot = await getMealSlotContext(db, slotId);
  if (!slot) throw new Error("Meal Slot not found");
  if (!canChangeMeal(slot.meal)) return { error: "notChangeable" };
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
  if (!canChangeMeal(slot.meal)) return { error: "notChangeable" };
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

// A slot added by hand is filled with a non-Archived Recipe or Product and
// takes one of its Roles, else Kinds, as its Slot Category. Blank takes the
// first in the order the planner's chooser lists them, which it pre-selects.
export async function addMealSlotAction(
  mealId: string,
  _state: NewMealSlotFormState,
  formData: FormData,
): Promise<NewMealSlotFormState> {
  const db = getDb();
  const meal = await getMeal(db, mealId);
  if (!meal) throw new Error("Meal not found");
  if (!canChangeMeal(meal)) return { error: "notChangeable" };
  const parsed = parseNewMealSlot(
    {
      food: String(formData.get("food") ?? ""),
      amount: String(formData.get("amount") ?? ""),
      slotCategoryId: String(formData.get("slotCategoryId") ?? ""),
    },
    await newSlotPickable(db),
  );
  if (!parsed.ok) return { error: parsed.error };
  await addMealSlot(db, mealId, parsed.slot);
  refresh();
  return { error: null };
}

// The slots after it move up, keeping their order. Nothing changes if the
// Meal was Confirmed or Skipped; the refresh shows the planner it was.
export async function removeMealSlotAction(slotId: string): Promise<void> {
  const db = getDb();
  const slot = await getMealSlotContext(db, slotId);
  if (slot && canChangeMeal(slot.meal)) await removeMealSlot(db, slotId);
  refresh();
}

// Nothing changes if the Meal was Confirmed or Skipped; the refresh shows the
// planner it was.
export async function emptyMealSlotAction(slotId: string): Promise<void> {
  const db = getDb();
  const slot = await getMealSlotContext(db, slotId);
  if (slot && canChangeMeal(slot.meal)) await fillMealSlot(db, slotId, { content: "empty" });
  refresh();
}

// `today` is the viewer's date when they submitted. Null once Confirmed;
// otherwise why it was refused, with nothing written.
export async function confirmMealAction(
  id: string,
  untracked: boolean,
  today: string,
): Promise<ConfirmMealError | null> {
  const result = await confirmMeal(getDb(), id, { untracked, today });
  if (!result.ok) return result;
  refresh();
  return null;
}

// "Confirm all as planned" on the Meals the viewer was shown, each on its own.
// `today` is the viewer's date when they submitted. The ones refused, with
// why, and nothing written for them.
export async function confirmMealsAsPlannedAction(
  ids: string[],
  today: string,
): Promise<RefusedMeal[]> {
  const refused = await confirmMealsAsPlanned(getDb(), ids, today);
  refresh();
  return refused;
}

// `today` is the viewer's date when they submitted. Null once Skipped;
// otherwise why it was refused, with nothing written.
export async function skipMealAction(id: string, today: string): Promise<SkipMealError | null> {
  if (!(await skipMeal(getDb(), id, today))) return { error: "notSkippable" };
  refresh();
  return null;
}

// Nothing changes if the Meal is no longer Confirmed or Skipped; the refresh
// shows the planner it is not.
export async function reopenMealAction(id: string): Promise<void> {
  await reopenMeal(getDb(), id);
  refresh();
}

export async function removeMealAction(id: string): Promise<void> {
  await deleteMeal(getDb(), id);
  refresh();
}
