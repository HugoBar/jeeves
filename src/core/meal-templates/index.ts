// What the user sets on a Meal Template. It is only a shortcut: a Meal created
// from it copies these and keeps no link to it (data-model Q5).
export interface MealTemplateFields {
  name: string;
  // A time of day, "HH:MM" on a 24-hour clock.
  hour: string;
  mealTypeId: string;
}

// "HH:MM" from 00:00 to 23:59, as a time input sends it.
const HOUR = /^([01]\d|2[0-3]):[0-5]\d$/;

export type MealTemplateFieldError = "blankName" | "invalidHour" | "noMealType";

export type MealTemplateFieldsResult =
  | { ok: true; fields: MealTemplateFields }
  | { ok: false; errors: MealTemplateFieldError[] };

export function parseMealTemplateFields(input: MealTemplateFields): MealTemplateFieldsResult {
  const name = input.name.trim();
  const hour = input.hour.trim();
  const mealTypeId = input.mealTypeId.trim();

  const errors: MealTemplateFieldError[] = [];
  if (!name) errors.push("blankName");
  if (!HOUR.test(hour)) errors.push("invalidHour");
  if (!mealTypeId) errors.push("noMealType");
  if (errors.length) return { ok: false, errors };

  return { ok: true, fields: { name, hour, mealTypeId } };
}

// Earliest hour first; "HH:MM" text sorts as time does. Ties go alphabetically
// by name, ignoring case.
export function sortMealTemplates<T extends { name: string; hour: string }>(templates: readonly T[]): T[] {
  return [...templates].sort(
    (a, b) => a.hour.localeCompare(b.hour) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}
