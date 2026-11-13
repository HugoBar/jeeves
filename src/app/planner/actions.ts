"use server";

import { refresh } from "next/cache";
import { sortCategories } from "@/core/food-categories";
import {
  canChangeMeal,
  parseMealChanges,
  parseMealSlotCategory,
  parseMealSlotChanges,
  parseMealSlotFill,
  parseNewMeal,
  parseNewMealSlot,
  parseNewMealSlots,
  newMealSlotPickable,
  pickableForSlot,
  type MealFieldError,
  type MealSlotCategoryError,
  type MealSlotChangeError,
  type MealSlotChangesInput,
  type MealSlotFillError,
  type NewMealInput,
  type NewMealSlotError,
  type NewMealSlotInput,
  type NewMealSlotPickable,
  type NewMealSlotRowError,
  type NewMealSlotsResult,
} from "@/core/meals";
import { parseRepeatOn, type RepeatOnResult, type SeriesScope } from "@/core/meal-series";
import { isDate, plannerRange } from "@/core/planner";
import { fillEmptySlots, type SlotFill } from "@/core/suggestions";
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
import { createDueRepeats } from "@/db/meal-series";
import { listMealTemplates, listPickableMealTypes, listPickableSlotCategories } from "@/db/meal-templates";
import {
  addMealSlot,
  createMeal,
  deleteMeal,
  fillMealSlot,
  getMeal,
  getMealSlotContext,
  listFoodsForSlots,
  removeMealSlot,
  setMealSlotCategory,
  updateMeal,
} from "@/db/meals";
import { fillEmptyMealSlots, loadSuggestionContext, undoFill } from "@/db/suggestions";
import { foodCategoryLabel } from "@/strings";

// "Repeat on" as a Meal form sends it: each ticked weekday's number.
type RepeatOnValues = { repeatOn: string[] };

// `values` refills the form after a rejected submit, which React resets. The
// slots are the ones added on the form, before the Meal exists.
export type NewMealFormValues = Omit<NewMealInput, "date"> & { slots: NewMealSlotInput[] } & RepeatOnValues;
export type NewMealFormState = { errors: MealFieldError[]; slotErrors: NewMealSlotRowError[]; values: NewMealFormValues };
export type MealChangesFormValues = Pick<NewMealInput, "hour" | "name" | "untracked"> & RepeatOnValues;
// `slotErrors` are the slots whose new Slot Category was refused.
export type MealChangesFormState = {
  errors: MealFieldError[];
  slotErrors: MealSlotChangeError[];
  values: MealChangesFormValues;
};
// "notChangeable": the Meal was Confirmed or Skipped since the planner was
// loaded.
export type MealSlotCategoryFormState = { error: MealSlotCategoryError | "notChangeable" | null };
export type MealSlotFillFormState = { error: MealSlotFillError | MealSlotCategoryError | "notChangeable" | null };
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

// What a new Meal can have, by id: the non-Archived Meal Types and, for its
// empty slots, Food Categories, plus the Archived ones a Meal Template still
// uses, since a Meal copied from it keeps them (data-model Q5).
async function newMealPickable(db: Db) {
  const templateIds = (await listMealTemplates(db)).map((template) => template.id);
  const [mealTypes, categories] = await Promise.all([
    listPickableMealTypes(db, templateIds),
    listPickableSlotCategories(db, templateIds),
  ]);
  const ids = (items: { id: string }[]) => new Set(items.map((item) => item.id));
  return { mealTypes: ids(mealTypes), emptySlotCategories: ids(categories) };
}

// The slots on the Meal form: each added by hand checked as one added on the
// planner is, and each copied empty from a Meal Template checked against
// `emptySlotCategories`.
async function parseFormSlots(
  db: Db,
  inputs: NewMealSlotInput[],
  emptySlotCategories: ReadonlySet<string>,
): Promise<NewMealSlotsResult> {
  if (inputs.length === 0) return { ok: true, slots: [] };
  return parseNewMealSlots(inputs, await newSlotPickable(db), emptySlotCategories);
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
    const again = await parseFormSlots(db, inputs, (await newMealPickable(db)).emptySlotCategories);
    if (again.ok) throw error;
    return { ok: false, errors: again.errors };
  }
}

// A Meal form also sends the viewer's date as they submitted, which "Repeat
// on" is checked against: only a Meal dated today or later can repeat.
function submittedToday(formData: FormData): string {
  const today = String(formData.get("today") ?? "");
  if (!isDate(today)) throw new Error("Not a date");
  return today;
}

// `date` is the planner day the form was opened on. The form is New Meal from
// scratch or from a Meal Template, which only fills it in. The Meal, the
// slots on the form and, if "Repeat on" has days ticked, its Meal Series are
// written together, or not at all; the series' repeats due now follow.
export async function createMealAction(
  date: string,
  _state: NewMealFormState,
  formData: FormData,
): Promise<NewMealFormState> {
  const db = getDb();
  const pickable = await newMealPickable(db);
  const values = {
    mealTypeId: String(formData.get("mealTypeId") ?? ""),
    hour: String(formData.get("hour") ?? ""),
    name: String(formData.get("name") ?? ""),
    untracked: formData.get("untracked") === "on",
    slots: newSlotInputs(formData),
    repeatOn: formData.getAll("repeatOn").map(String),
  };
  const today = submittedToday(formData);
  const parsed = parseNewMeal({ date, ...values }, pickable.mealTypes);
  const repeatOn = parseRepeatOn(values.repeatOn, date, today);
  const slots = await parseFormSlots(db, values.slots, pickable.emptySlotCategories);
  if (!parsed.ok || !repeatOn.ok || !slots.ok) {
    const errors = [...(parsed.ok ? [] : parsed.errors), ...(repeatOn.ok ? [] : [repeatOn.error])];
    return { errors, slotErrors: slots.ok ? [] : slots.errors, values };
  }
  const written = await writeWithSlots(db, values.slots, () =>
    createMeal(db, parsed.fields, slots.slots, repeatOn.weekdays),
  );
  if (!written.ok) return { errors: [], slotErrors: written.errors, values };
  if (repeatOn.weekdays.length > 0) await createDueRepeats(db, today);
  refresh();
  return {
    errors: [],
    slotErrors: [],
    values: { mealTypeId: "", hour: "", name: "", untracked: false, slots: [], repeatOn: [] },
  };
}

// "Repeat on" left alone: no days to start a Meal Series with.
const NO_REPEAT = { ok: true, weekdays: [] } as const satisfies RepeatOnResult;

// The ids of the non-Archived Food Categories: what a slot can be changed to.
async function activeCategoryIds(db: Db): Promise<Set<string>> {
  return new Set((await listActiveCategories(db)).map((category) => category.id));
}

// Edit Meal's slots, when they were changed on the form: each slot kept, in
// the order shown, each removed, and each given a new Slot Category, with it
// under the same index.
function slotChangesInput(formData: FormData): MealSlotChangesInput | null {
  if (!formData.has("slotOrder") && !formData.has("removedSlotId")) return null;
  const all = (name: string) => formData.getAll(name).map(String);
  const categories = all("changedSlotCategoryId");
  return {
    order: all("slotOrder"),
    removed: all("removedSlotId"),
    slotCategories: all("changedSlotId").map((slotId, index) => ({ slotId, slotCategoryId: categories[index] ?? "" })),
  };
}

// Hour, name, Untracked, the slot changes kept on the form and, for a Meal in
// no Meal Series, a series if "Repeat on" has days ticked, are written
// together, or not at all; the series' repeats due now follow. A Meal already
// in one shows its days but can't change them here; its hour, name and
// Untracked change on it alone, or on it and all following when
// "seriesScope" says so. Nothing changes if the Meal was Confirmed or
// Skipped; the refresh shows the planner it was.
export async function editMealAction(
  id: string,
  _state: MealChangesFormState,
  formData: FormData,
): Promise<MealChangesFormState> {
  const db = getDb();
  const meal = await getMeal(db, id);
  if (!meal) throw new Error("Meal not found");
  if (!canChangeMeal(meal)) {
    refresh();
    const repeatOn = (meal.repeats ?? []).map(String);
    return {
      errors: [],
      slotErrors: [],
      values: { hour: meal.hour, name: meal.name ?? "", untracked: meal.untracked, repeatOn },
    };
  }
  const values = {
    hour: String(formData.get("hour") ?? ""),
    name: String(formData.get("name") ?? ""),
    untracked: formData.get("untracked") === "on",
    repeatOn: meal.repeats ? meal.repeats.map(String) : formData.getAll("repeatOn").map(String),
  };
  const today = submittedToday(formData);
  const parsed = parseMealChanges(values);
  const repeatOn = meal.repeats ? NO_REPEAT : parseRepeatOn(values.repeatOn, meal.date, today);
  const input = slotChangesInput(formData);
  const slots = input
    ? parseMealSlotChanges(input, meal.slots, await activeCategoryIds(db))
    : null;
  if (!parsed.ok || !repeatOn.ok || (slots && !slots.ok)) {
    const errors = [...(parsed.ok ? [] : parsed.errors), ...(repeatOn.ok ? [] : [repeatOn.error])];
    return { errors, slotErrors: slots && !slots.ok ? slots.errors : [], values };
  }
  const scope: SeriesScope = formData.get("seriesScope") === "following" ? "following" : "this";
  const saved = await updateMeal(db, id, parsed.changes, slots?.changes, repeatOn.weekdays, scope);
  if (saved && repeatOn.weekdays.length > 0) await createDueRepeats(db, today);
  refresh();
  return { errors: [], slotErrors: [], values };
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
  const parsed = parseMealSlotCategory(String(formData.get("slotCategoryId") ?? ""), await activeCategoryIds(db));
  if (!parsed.ok) return { error: parsed.error };
  await setMealSlotCategory(db, slotId, parsed.slotCategoryId);
  refresh();
  return { error: null };
}

// A slot can only be filled with what its picker offers: a non-Archived
// Recipe or Product carrying its Slot Category, or Leftovers if its Meal Type
// allows them. On Edit Meal, `slotCategoryId` is the one picked on the form,
// not saved yet, which must not be Archived; the fill is checked against it
// but only the food is written.
export async function fillMealSlotAction(
  slotId: string,
  _state: MealSlotFillFormState,
  formData: FormData,
): Promise<MealSlotFillFormState> {
  const db = getDb();
  const slot = await getMealSlotContext(db, slotId);
  if (!slot) throw new Error("Meal Slot not found");
  if (!canChangeMeal(slot.meal)) return { error: "notChangeable" };
  const formCategory = formData.get("slotCategoryId");
  let slotCategoryId = slot.slotCategoryId;
  if (formCategory !== null && String(formCategory) !== slotCategoryId) {
    const parsed = parseMealSlotCategory(String(formCategory), await activeCategoryIds(db));
    if (!parsed.ok) return { error: parsed.error };
    slotCategoryId = parsed.slotCategoryId;
  }
  const { recipes, products } = await listFoodsForSlots(db);
  const ids = (foods: { id: string }[]) => new Set(foods.map((food) => food.id));
  const parsed = parseMealSlotFill(
    { food: String(formData.get("food") ?? ""), amount: String(formData.get("amount") ?? "") },
    {
      recipeIds: ids(pickableForSlot(recipes, slotCategoryId)),
      productIds: ids(pickableForSlot(products, slotCategoryId)),
      allowsLeftovers: slot.allowsLeftovers,
    },
  );
  if (!parsed.ok) return { error: parsed.error };
  await fillMealSlot(db, slotId, parsed.fill);
  refresh();
  return { error: null };
}

// What "Fill empty slots" or "Use all N Suggestions" did: the slots filled,
// with what went in each, and how many were left empty because their
// Suggestion is a Product never in a Meal Slot, so it has no quantity yet.
export type FillOutcome = { filled: SlotFill[]; noQuantity: number };

// Each of `slotIds` that is still empty, in a Planned or Unconfirmed Meal,
// gets its Suggestion, worked out again from what is stored now, each fill
// counted by the slots after it (spec "Suggestions"). `today` is the viewer's
// date when they asked. A slot filled meanwhile keeps what it holds.
export async function fillEmptySlotsAction(slotIds: string[], today: string): Promise<FillOutcome> {
  if (!isDate(today)) throw new Error("Not a date");
  const db = getDb();
  const { from, to } = plannerRange(today);
  const context = await loadSuggestionContext(db, from, to);
  const { fills, noQuantity } = fillEmptySlots({ ...context, slotIds, today });
  const filled = await fillEmptyMealSlots(db, fills);
  refresh();
  return { filled, noQuantity: noQuantity.length };
}

// Undo of "Fill empty slots": each slot it filled is emptied again, unless it
// was changed since or its Meal was Confirmed or Skipped.
export async function undoFillAction(filled: SlotFill[]): Promise<void> {
  await undoFill(getDb(), filled);
  refresh();
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

// Creates the Meal Series repeats due on `today`, the viewer's date (spec
// "Meal Series"). Every screen that shows or uses Meals asks first. It
// refreshes only when it created some, so asking again changes nothing.
export async function createDueRepeatsAction(today: string): Promise<void> {
  if (!isDate(today)) throw new Error("Not a date");
  if ((await createDueRepeats(getDb(), today)) > 0) refresh();
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

// `scope` only matters for a Meal of a Meal Series. It comes from the
// browser, so anything but "following" deletes that Meal alone.
export async function removeMealAction(id: string, scope: SeriesScope = "this"): Promise<void> {
  await deleteMeal(getDb(), id, scope === "following" ? "following" : "this");
  refresh();
}
