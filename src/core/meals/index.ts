import { AMOUNT_COLUMN, parsePositive, parseWholeAboveZero } from "@/core/amounts";
import type { CategoryKind } from "@/core/food-categories";
import type { RepeatOnError, Weekday } from "@/core/meal-series";
import { addDays, isDate, mondayOf } from "@/core/planner";

// A Meal's stored status (data-model Q3). Unconfirmed is never stored.
export const MEAL_STATUSES = ["planned", "confirmed", "skipped"] as const;

export type MealStatus = (typeof MEAL_STATUSES)[number];

// What a Meal Slot holds (data-model Q4).
export const MEAL_SLOT_CONTENTS = ["empty", "recipe", "product", "leftovers"] as const;

export type MealSlotContent = (typeof MEAL_SLOT_CONTENTS)[number];

// A Meal Slot's content with the values that go with it: a Recipe's Portions
// (whole numbers, data-model T4) or a Product's quantity in its Default Unit.
// Leftovers deduct nothing, so they carry nothing.
export type MealSlotFill =
  | { content: "empty" }
  | { content: "recipe"; recipeId: string; portions: number }
  | { content: "product"; productId: string; quantity: number }
  | { content: "leftovers" };

// What the user sets on a Meal made from scratch: its day, Meal Type and hour,
// plus an optional name shown in place of the Meal Type (data-model Q5), and
// whether it is Untracked: eaten out or from outside, deducting nothing.
export interface NewMealFields {
  date: string;
  // A time of day, "HH:MM" on a 24-hour clock.
  hour: string;
  name: string | null;
  mealTypeId: string;
  untracked: boolean;
}

// What can change on a Meal: never its Meal Type.
export type MealChanges = Pick<NewMealFields, "hour" | "name" | "untracked">;

// "HH:MM" from 00:00 to 23:59, as a time input sends it.
const HOUR = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isHour(text: string): boolean {
  return HOUR.test(text);
}

export type MealFieldError = "invalidDate" | "invalidHour" | "noMealType" | "unavailableMealType" | RepeatOnError;

export type NewMealResult = { ok: true; fields: NewMealFields } | { ok: false; errors: MealFieldError[] };

// Raw values from a Meal form; a blank name is no name.
export interface NewMealInput {
  date: string;
  hour: string;
  name: string;
  mealTypeId: string;
  untracked: boolean;
}

// `pickable` holds the Meal Types a new Meal can have: the non-Archived ones,
// plus an Archived one a Meal Template still uses, which a Meal copied from it
// keeps.
export function parseNewMeal(input: NewMealInput, pickable: ReadonlySet<string>): NewMealResult {
  const date = input.date.trim();
  const mealTypeId = input.mealTypeId.trim();
  const changes = parseMealChanges(input);

  const errors: MealFieldError[] = [];
  if (!isDate(date)) errors.push("invalidDate");
  if (!changes.ok) errors.push(...changes.errors);
  if (!mealTypeId) errors.push("noMealType");
  else if (!pickable.has(mealTypeId)) errors.push("unavailableMealType");
  if (errors.length || !changes.ok) return { ok: false, errors };

  return { ok: true, fields: { date, mealTypeId, ...changes.changes } };
}

export type MealSlotCategoryError = "noSlotCategory" | "unavailableSlotCategory";

export type MealSlotCategoryResult =
  | { ok: true; slotCategoryId: string }
  | { ok: false; error: MealSlotCategoryError };

// `pickable` holds the Food Categories a slot can be changed to: the
// non-Archived ones. A slot keeps an Archived one only until it is changed.
export function parseMealSlotCategory(categoryId: string, pickable: ReadonlySet<string>): MealSlotCategoryResult {
  const slotCategoryId = categoryId.trim();
  if (!slotCategoryId) return { ok: false, error: "noSlotCategory" };
  if (!pickable.has(slotCategoryId)) return { ok: false, error: "unavailableSlotCategory" };
  return { ok: true, slotCategoryId };
}

// What one slot's picker offers: the non-Archived Recipes and Products
// carrying its Slot Category, and Leftovers if its Meal Type allows them.
export interface MealSlotPickable {
  recipeIds: ReadonlySet<string>;
  productIds: ReadonlySet<string>;
  allowsLeftovers: boolean;
}

// Raw values from a slot's fill form. `food` is the picked option:
// "recipe:<id>", "product:<id>" or "leftovers". `amount` is the Portions or
// quantity, ignored for Leftovers.
export interface MealSlotFillInput {
  food: string;
  amount: string;
}

// The fill form's option value for a Recipe or Product, as parseMealSlotFill
// reads it.
export function slotFoodValue(content: "recipe" | "product", id: string): string {
  return `${content}:${id}`;
}

export type MealSlotFillError = "noFood" | "unavailableFood" | "invalidPortions" | "invalidQuantity";

export type MealSlotFillResult = { ok: true; fill: MealSlotFill } | { ok: false; error: MealSlotFillError };

export function parseMealSlotFill(input: MealSlotFillInput, pickable: MealSlotPickable): MealSlotFillResult {
  const food = input.food.trim();
  const amount = input.amount.trim();
  if (!food) return { ok: false, error: "noFood" };
  if (food === "leftovers") {
    return pickable.allowsLeftovers ? { ok: true, fill: { content: "leftovers" } } : { ok: false, error: "unavailableFood" };
  }

  const [kind, id = ""] = food.split(/:(.*)/);
  if (kind === "recipe" && pickable.recipeIds.has(id)) {
    const portions = parseWholeAboveZero(amount);
    if (portions === null) return { ok: false, error: "invalidPortions" };
    return { ok: true, fill: { content: "recipe", recipeId: id, portions } };
  }
  if (kind === "product" && pickable.productIds.has(id)) {
    const quantity = parsePositive(amount, AMOUNT_COLUMN);
    if (quantity === null) return { ok: false, error: "invalidQuantity" };
    return { ok: true, fill: { content: "product", productId: id, quantity } };
  }
  return { ok: false, error: "unavailableFood" };
}

// What adding a slot by hand offers: every non-Archived Recipe and Product,
// by id, each with its slotCategoryChoices' ids. Leftovers are not offered:
// they have no Food Categories to give the slot.
export interface NewMealSlotPickable {
  recipes: ReadonlyMap<string, readonly string[]>;
  products: ReadonlyMap<string, readonly string[]>;
}

// Raw values from the add slot form: the fill form's, plus the Slot Category
// picked from the food's choices. Blank takes the first, which the chooser
// pre-selects and which is the only one when no chooser shows.
export interface NewMealSlotInput extends MealSlotFillInput {
  slotCategoryId: string;
}

export interface NewMealSlot {
  slotCategoryId: string;
  fill: Extract<MealSlotFill, { content: "recipe" | "product" }>;
}

export type NewMealSlotError = MealSlotFillError | "uncategorisedFood" | "unavailableSlotCategory";

export type NewMealSlotResult = { ok: true; slot: NewMealSlot } | { ok: false; error: NewMealSlotError };

export function parseNewMealSlot(input: NewMealSlotInput, pickable: NewMealSlotPickable): NewMealSlotResult {
  const parsed = parseMealSlotFill(input, {
    recipeIds: new Set(pickable.recipes.keys()),
    productIds: new Set(pickable.products.keys()),
    allowsLeftovers: false,
  });
  if (!parsed.ok) return parsed;
  const { fill } = parsed;
  // Leftovers were refused above; this only narrows the type.
  if (fill.content !== "recipe" && fill.content !== "product") return { ok: false, error: "unavailableFood" };

  const choices = fill.content === "recipe" ? pickable.recipes.get(fill.recipeId)! : pickable.products.get(fill.productId)!;
  if (choices.length === 0) return { ok: false, error: "uncategorisedFood" };
  const slotCategoryId = input.slotCategoryId.trim() || choices[0]!;
  if (!choices.includes(slotCategoryId)) return { ok: false, error: "unavailableSlotCategory" };
  return { ok: true, slot: { slotCategoryId, fill } };
}

// What adding a slot by hand offers, built from the non-Archived Recipes
// (with their final Food Categories) and Products, and the non-Archived Food
// Categories in the order the chooser lists them. The planner checks a slot
// against it on the server, and the Meal form before the slot is added.
export function newMealSlotPickable<T extends { id: string; kind: CategoryKind }>(
  recipes: readonly { id: string; categoryIds: readonly string[] }[],
  products: readonly { id: string; categoryIds: readonly string[] }[],
  categories: readonly T[],
): NewMealSlotPickable {
  const choices = (foods: readonly { id: string; categoryIds: readonly string[] }[]) =>
    new Map(foods.map((food) => [food.id, slotCategoryChoices(food.categoryIds, categories).map((c) => c.id)]));
  return { recipes: choices(recipes), products: choices(products) };
}

// A slot added on the Meal form, refused. `row` counts from 1, as the form
// shows the slots.
export type NewMealSlotRowError = { row: number; code: NewMealSlotError };

// A slot on the Meal form: one added by hand, filled, or one copied from a
// Meal Template, empty with the template slot's Slot Category.
export type MealFormSlot = NewMealSlot | { slotCategoryId: string; fill: { content: "empty" } };

// The slots on the Meal form, all read, or why each refused one was.
export type NewMealSlotsResult = { ok: true; slots: MealFormSlot[] } | { ok: false; errors: NewMealSlotRowError[] };

// The slots on the Meal form before the Meal exists, in the order shown, so
// none is written unless all of them can be. One with food is checked as
// parseNewMealSlot does. One without is an empty slot copied from a Meal
// Template, whose Slot Category must be in `emptySlotCategories`.
export function parseNewMealSlots(
  inputs: readonly NewMealSlotInput[],
  pickable: NewMealSlotPickable,
  emptySlotCategories: ReadonlySet<string> = new Set(),
): NewMealSlotsResult {
  const slots: MealFormSlot[] = [];
  const errors: NewMealSlotRowError[] = [];
  inputs.forEach((input, index) => {
    const parsed = input.food.trim() ? parseNewMealSlot(input, pickable) : parseEmptySlot(input, emptySlotCategories);
    if (parsed.ok) slots.push(parsed.slot);
    else errors.push({ row: index + 1, code: parsed.error });
  });
  return errors.length ? { ok: false, errors } : { ok: true, slots };
}

function parseEmptySlot(
  input: NewMealSlotInput,
  pickable: ReadonlySet<string>,
): { ok: true; slot: MealFormSlot } | { ok: false; error: NewMealSlotError } {
  const slotCategoryId = input.slotCategoryId.trim();
  if (!pickable.has(slotCategoryId)) return { ok: false, error: "unavailableSlotCategory" };
  return { ok: true, slot: { slotCategoryId, fill: { content: "empty" } } };
}

// The Recipes or Products a slot's picker offers: those carrying its Slot
// Category. For a Recipe, `categoryIds` is its final Food Categories, after
// overrides.
export function pickableForSlot<T extends { categoryIds: readonly string[] }>(
  foods: readonly T[],
  slotCategoryId: string,
): T[] {
  return foods.filter((food) => food.categoryIds.includes(slotCategoryId));
}

// The Slot Categories a slot added by hand can take from the Recipe or
// Product put in it: its Roles, else its Kinds (spec "Planning"). The first is
// pre-selected; none means it cannot be hand-added. `categories` holds
// the non-Archived Food Categories in the order the chooser lists them, so an
// Archived one is never offered. `foodCategoryIds` is the Recipe's final or
// the Product's Food Categories.
export function slotCategoryChoices<T extends { id: string; kind: CategoryKind }>(
  foodCategoryIds: readonly string[],
  categories: readonly T[],
): T[] {
  const carried = categories.filter((category) => foodCategoryIds.includes(category.id));
  const roles = carried.filter((category) => category.kind === "role");
  return roles.length > 0 ? roles : carried;
}

export type MealChangesResult = { ok: true; changes: MealChanges } | { ok: false; errors: "invalidHour"[] };

export function parseMealChanges(input: { hour: string; name: string; untracked: boolean }): MealChangesResult {
  const hour = input.hour.trim();
  if (!isHour(hour)) return { ok: false, errors: ["invalidHour"] };
  return { ok: true, changes: { hour, name: input.name.trim() || null, untracked: input.untracked } };
}

// Whether Save on Edit Meal first asks which Meals of its Meal Series a
// change applies to: only when the Meal is in one and its hour, name or
// Untracked, as Save would write them, differ from `meal`'s (spec "Meal
// Series"). An hour Save refuses doesn't ask, so its error shows straight
// away.
export function asksWhichMeals(
  meal: MealChanges & { repeats: readonly Weekday[] | null },
  input: { hour: string; name: string; untracked: boolean },
): boolean {
  if (meal.repeats === null) return false;
  const parsed = parseMealChanges(input);
  if (!parsed.ok) return false;
  const { hour, name, untracked } = parsed.changes;
  return hour !== meal.hour || name !== meal.name || untracked !== meal.untracked;
}

// A slot given a new Slot Category on Edit Meal.
export interface SlotCategoryChange {
  slotId: string;
  slotCategoryId: string;
}

// What Edit Meal sends of its slots on Save: the slots kept, in the order
// shown, the ones removed on the form, and the ones given a new Slot
// Category there. A slot whose Slot Category was not changed on the form is
// not sent one, so a change made elsewhere meanwhile stays.
export interface MealSlotChangesInput {
  order: readonly string[];
  removed: readonly string[];
  slotCategories: readonly SlotCategoryChange[];
}

// What Save writes to a Meal's slots: the ones to remove, every other one in
// its new order, and the Slot Categories changed.
export interface MealSlotChanges {
  removed: string[];
  order: string[];
  slotCategories: SlotCategoryChange[];
}

// A slot whose new Slot Category was refused.
export type MealSlotChangeError = { slotId: string; code: MealSlotCategoryError };

export type MealSlotChangesResult =
  | { ok: true; changes: MealSlotChanges }
  | { ok: false; errors: MealSlotChangeError[] };

// `current` is the Meal's slots as stored now, in order. A slot sent that is
// gone was removed meanwhile, so it is left out; one added meanwhile, sent
// neither kept nor removed, goes after the kept ones. A Slot Category sent
// that differs from the stored one must be in `pickable`, the non-Archived
// ones.
export function parseMealSlotChanges(
  input: MealSlotChangesInput,
  current: readonly { id: string; slotCategoryId: string }[],
  pickable: ReadonlySet<string>,
): MealSlotChangesResult {
  const stored = new Map(current.map((slot) => [slot.id, slot.slotCategoryId]));
  const removed = new Set(input.removed.filter((id) => stored.has(id)));
  const kept = (id: string) => stored.has(id) && !removed.has(id);
  const order = [...new Set(input.order.filter(kept))];
  for (const { id } of current) if (kept(id) && !order.includes(id)) order.push(id);
  const slotCategories: SlotCategoryChange[] = [];
  const errors: MealSlotChangeError[] = [];
  for (const { slotId, slotCategoryId } of input.slotCategories) {
    if (!kept(slotId) || slotCategoryId === stored.get(slotId)) continue;
    const parsed = parseMealSlotCategory(slotCategoryId, pickable);
    if (parsed.ok) slotCategories.push({ slotId, slotCategoryId: parsed.slotCategoryId });
    else errors.push({ slotId, code: parsed.error });
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, changes: { removed: [...removed], order, slotCategories } };
}

// A day's Meals by hour; "HH:MM" text sorts as time does. Ties go to the Meal
// created first, as Projected Stock orders them (spec "Projected Stock").
export function sortMeals<T extends { hour: string; createdAt: Date }>(meals: readonly T[]): T[] {
  return [...meals].sort((a, b) => a.hour.localeCompare(b.hour) || a.createdAt.getTime() - b.createdAt.getTime());
}

// Meals from several days: earlier days first, each day's as sortMeals.
export function sortMealsByDay<T extends { date: string; hour: string; createdAt: Date }>(meals: readonly T[]): T[] {
  return sortMeals(meals).sort((a, b) => a.date.localeCompare(b.date));
}

// Only a Planned or Unconfirmed Meal can be edited, marked Untracked or
// removed, or have its slots changed (spec "Confirmation": before confirming,
// slots can be edited). A Confirmed or Skipped one is read-only until it is
// Reopened.
export function canChangeMeal(meal: { status: MealStatus }): boolean {
  return meal.status === "planned";
}

// A Meal can be Confirmed or Skipped once its day has come: a Planned or
// Unconfirmed Meal dated today or earlier (spec "Confirmation"). `today` is
// the viewer's date, sent with the request; without a real date the Meal's
// day cannot be checked.
export function canConfirmOrSkip(meal: { status: MealStatus; date: string }, today: string): boolean {
  return isDate(today) && canChangeMeal(meal) && meal.date <= today;
}

// A Planned Meal dated today or later can't keep an Archived Recipe or
// Product: its slot asks for another (spec "Confirmation"). A Meal
// whose day has passed keeps it, as does a Confirmed or Skipped one.
// `foodArchived` is whether the slot's Recipe or Product is Archived.
export function asksForAnotherFood(
  meal: { status: MealStatus; date: string },
  foodArchived: boolean,
  today: string,
): boolean {
  return foodArchived && canChangeMeal(meal) && meal.date >= today;
}

// Both Confirm outcomes are refused while a slot asks for another food;
// Skip is not. `foodsArchived` says, for each slot, whether its Recipe or
// Product is Archived.
export function blockedByArchivedFood(
  meal: { status: MealStatus; date: string },
  foodsArchived: readonly boolean[],
  today: string,
): boolean {
  return foodsArchived.some((archived) => asksForAnotherFood(meal, archived, today));
}

// A Meal later today may not have happened yet, so Confirming or Skipping it
// asks first. `now` is the viewer's date and "HH:MM" time; "HH:MM" text sorts
// as time does.
export function confirmOrSkipAsksFirst(
  meal: { date: string; hour: string },
  now: { date: string; hour: string },
): boolean {
  return meal.date === now.date && meal.hour > now.hour;
}

// A Confirmed or Skipped Meal can be Reopened, back to Planned or Unconfirmed.
export function canReopen(meal: { status: MealStatus }): boolean {
  return meal.status === "confirmed" || meal.status === "skipped";
}

// Where a Reopened Meal goes: back to Planned, so Unconfirmed once its day is
// before `today`, the viewer's date.
export function reopensAs(meal: { date: string }, today: string): "planned" | "unconfirmed" {
  return isUnconfirmed({ status: "planned", date: meal.date }, today) ? "unconfirmed" : "planned";
}

// Unconfirmed is never stored: a Meal is Unconfirmed while it is still
// "planned" and its day is before `today`, the viewer's date (spec
// "Platform").
export function isUnconfirmed(meal: { status: MealStatus; date: string }, today: string): boolean {
  return meal.status === "planned" && meal.date < today;
}

// What a Meal's card shows as its status; null for a Planned Meal, which
// shows nothing. Skipped doesn't say whether the Meal is Untracked.
export type MealCardStatus =
  | "confirmed"
  | "confirmedUntracked"
  | "untracked"
  | "unconfirmed"
  | "unconfirmedUntracked"
  | "skipped";

export function mealCardStatus(
  meal: { status: MealStatus; untracked: boolean; date: string },
  today: string,
): MealCardStatus | null {
  if (meal.status === "skipped") return "skipped";
  if (meal.status === "confirmed") return meal.untracked ? "confirmedUntracked" : "confirmed";
  if (isUnconfirmed(meal, today)) return meal.untracked ? "unconfirmedUntracked" : "unconfirmed";
  return meal.untracked ? "untracked" : null;
}

// The hour a day is closed on the day after it: late enough for a late Meal
// still going past midnight, early enough to come before the next day's
// first.
const DAY_CLOSE_HOUR = "03:00";

// The viewer's day as far as closing Meals goes: until 03:00 it is still
// yesterday. `now` is the viewer's date and "HH:MM" time.
function openDay(now: { date: string; hour: string }): string {
  return now.hour >= DAY_CLOSE_HOUR ? now.date : addDays(now.date, -1);
}

// The Unconfirmed Meals the in-app badge counts and the "Needs confirmation"
// list shows: yesterday's only from 03:00, any earlier day's always (#1).
// `now` is the viewer's date and "HH:MM" time.
export function needingConfirmation<T extends { status: MealStatus; date: string }>(
  meals: readonly T[],
  now: { date: string; hour: string },
): T[] {
  return meals.filter((meal) => isUnconfirmed(meal, openDay(now)));
}

// What the planner's "Close this week" banner lists: from Saturday, this
// week's Unconfirmed Meals (#1). `today` is the viewer's date.
export function weekToClose<T extends { status: MealStatus; date: string }>(meals: readonly T[], today: string): T[] {
  const monday = mondayOf(today);
  const saturday = addDays(monday, 5);
  if (today < saturday) return [];
  return meals.filter((meal) => meal.date >= monday && isUnconfirmed(meal, today));
}

// What the non-dismissable resolution screen asks for: every Unconfirmed Meal
// from a week before this one, so no week stays open once the next has
// started (#1). Until 03:00 on Monday, Sunday's week is still this one. `now`
// is the viewer's date and "HH:MM" time.
export function mustResolve<T extends { status: MealStatus; date: string }>(
  meals: readonly T[],
  now: { date: string; hour: string },
): T[] {
  const monday = mondayOf(openDay(now));
  return meals.filter((meal) => isUnconfirmed(meal, monday));
}

// The week the resolution screen closes: the one before the viewer's, Monday
// to Sunday, as "Last week" (#1). Until 03:00 on Monday it is the week before
// that Sunday's. `now` is the viewer's date and "HH:MM" time.
export function lastWeek(now: { date: string; hour: string }): { first: string; last: string } {
  const monday = mondayOf(openDay(now));
  return { first: addDays(monday, -7), last: addDays(monday, -1) };
}
