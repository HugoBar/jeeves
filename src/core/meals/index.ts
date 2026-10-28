import { AMOUNT_COLUMN, parsePositive, parseWholeAboveZero } from "@/core/amounts";
import { isDate } from "@/core/planner";

// A Meal's stored status (data-model Q3). Only Planned exists until
// Confirmation and Skipping do; Unconfirmed is never stored.
export const MEAL_STATUSES = ["planned"] as const;

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
// plus an optional name shown in place of the Meal Type (data-model Q5).
export interface NewMealFields {
  date: string;
  // A time of day, "HH:MM" on a 24-hour clock.
  hour: string;
  name: string | null;
  mealTypeId: string;
}

// What can change on a Meal: never its Meal Type.
export type MealChanges = Pick<NewMealFields, "hour" | "name">;

// "HH:MM" from 00:00 to 23:59, as a time input sends it.
const HOUR = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isHour(text: string): boolean {
  return HOUR.test(text);
}

export type MealFieldError = "invalidDate" | "invalidHour" | "noMealType" | "unavailableMealType";

export type NewMealResult = { ok: true; fields: NewMealFields } | { ok: false; errors: MealFieldError[] };

// Raw values from a Meal form; a blank name is no name.
export interface NewMealInput {
  date: string;
  hour: string;
  name: string;
  mealTypeId: string;
}

// `pickable` holds the Meal Types a new Meal can have: the non-Archived ones.
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

// A Meal made from a Meal Template copies its name, Meal Type, hour and empty
// slots, and keeps no link to it (data-model Q5). The template's Meal Type may
// be Archived: the Meal keeps it, as the template does.
export interface NewMealFromTemplateFields {
  date: string;
  templateId: string;
}

export type MealFromTemplateError = "invalidDate" | "noMealTemplate" | "unavailableMealTemplate";

export type NewMealFromTemplateResult =
  | { ok: true; fields: NewMealFromTemplateFields }
  | { ok: false; errors: MealFromTemplateError[] };

// `templates` holds the ids of every Meal Template.
export function parseNewMealFromTemplate(
  input: NewMealFromTemplateFields,
  templates: ReadonlySet<string>,
): NewMealFromTemplateResult {
  const date = input.date.trim();
  const templateId = input.templateId.trim();

  const errors: MealFromTemplateError[] = [];
  if (!isDate(date)) errors.push("invalidDate");
  if (!templateId) errors.push("noMealTemplate");
  else if (!templates.has(templateId)) errors.push("unavailableMealTemplate");
  if (errors.length) return { ok: false, errors };

  return { ok: true, fields: { date, templateId } };
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

// The Recipes or Products a slot's picker offers: those carrying its Slot
// Category. For a Recipe, `categoryIds` is its final Food Categories, after
// overrides.
export function pickableForSlot<T extends { categoryIds: readonly string[] }>(
  foods: readonly T[],
  slotCategoryId: string,
): T[] {
  return foods.filter((food) => food.categoryIds.includes(slotCategoryId));
}

// Whether a slot keeps what it holds when its Slot Category changes: a Recipe
// or Product only if it carries the new one. Leftovers have no Food
// Categories, so they always stay. `foodCategoryIds` is the Recipe's final or
// the Product's Food Categories.
export function slotKeepsFood(
  content: MealSlotContent,
  foodCategoryIds: readonly string[],
  slotCategoryId: string,
): boolean {
  if (content === "recipe" || content === "product") return foodCategoryIds.includes(slotCategoryId);
  return true;
}

export type MealChangesResult = { ok: true; changes: MealChanges } | { ok: false; errors: "invalidHour"[] };

export function parseMealChanges(input: { hour: string; name: string }): MealChangesResult {
  const hour = input.hour.trim();
  if (!isHour(hour)) return { ok: false, errors: ["invalidHour"] };
  return { ok: true, changes: { hour, name: input.name.trim() || null } };
}

// A day's Meals by hour; "HH:MM" text sorts as time does. Ties go to the Meal
// created first, as Projected Stock orders them (spec "Projected Stock").
export function sortMeals<T extends { hour: string; createdAt: Date }>(meals: readonly T[]): T[] {
  return [...meals].sort((a, b) => a.hour.localeCompare(b.hour) || a.createdAt.getTime() - b.createdAt.getTime());
}

// Planned: a Meal not Confirmed or Skipped whose day has not passed. Once it
// has, the Meal is Unconfirmed, which is never stored (data-model Q3).
// `today` is the viewer's date (spec "Platform").
export function isPlanned(meal: { status: MealStatus; date: string }, today: string): boolean {
  return meal.status === "planned" && meal.date >= today;
}
