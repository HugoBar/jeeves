import { isDate } from "@/core/planner";

// A Meal's stored status (data-model Q3). Only Planned exists until
// Confirmation and Skipping do; Unconfirmed is never stored.
export const MEAL_STATUSES = ["planned"] as const;

export type MealStatus = (typeof MEAL_STATUSES)[number];

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
