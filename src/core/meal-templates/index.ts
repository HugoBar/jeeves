// What the user sets on a Meal Template. It is only a shortcut: a Meal created
// from it copies these and keeps no link to it (data-model Q5).
export interface MealTemplateFields {
  name: string;
  // A time of day, "HH:MM" on a 24-hour clock.
  hour: string;
  mealTypeId: string;
}

// A whole Meal Template as saved: its fields and its slots' Slot Categories,
// in order.
export interface MealTemplateContent extends MealTemplateFields {
  slotCategoryIds: string[];
}

// "HH:MM" from 00:00 to 23:59, as a time input sends it.
const HOUR = /^([01]\d|2[0-3]):[0-5]\d$/;

export type MealTemplateFieldError = "blankName" | "invalidHour" | "noMealType" | "unavailableMealType";

export type MealTemplateFieldsResult =
  | { ok: true; fields: MealTemplateFields }
  | { ok: false; errors: MealTemplateFieldError[] };

// `pickable` holds the Meal Types a template can have: the non-Archived ones,
// plus an Archived one the template already uses, which it keeps until the user
// changes it.
export function parseMealTemplateFields(
  input: MealTemplateFields,
  pickable: ReadonlySet<string>,
): MealTemplateFieldsResult {
  const name = input.name.trim();
  const hour = input.hour.trim();
  const mealTypeId = input.mealTypeId.trim();

  const errors: MealTemplateFieldError[] = [];
  if (!name) errors.push("blankName");
  if (!HOUR.test(hour)) errors.push("invalidHour");
  if (!mealTypeId) errors.push("noMealType");
  else if (!pickable.has(mealTypeId)) errors.push("unavailableMealType");
  if (errors.length) return { ok: false, errors };

  return { ok: true, fields: { name, hour, mealTypeId } };
}

// A template's slots are only a Slot Category each, kept in the order given.
// `row` counts from 1, as the form shows the slots.
export type TemplateSlotError = { row: number; code: "noSlotCategory" | "unavailableSlotCategory" };

export type TemplateSlotsResult =
  | { ok: true; slotCategoryIds: string[] }
  | { ok: false; errors: TemplateSlotError[] };

// `pickable` holds the Food Categories a slot can have: the non-Archived ones,
// plus any Archived one the template already uses, which a slot keeps until
// the user changes it (spec "Food Categories").
export function parseTemplateSlots(slotCategoryIds: string[], pickable: ReadonlySet<string>): TemplateSlotsResult {
  const errors: TemplateSlotError[] = [];
  slotCategoryIds.forEach((categoryId, index) => {
    const row = index + 1;
    if (!categoryId) errors.push({ row, code: "noSlotCategory" });
    else if (!pickable.has(categoryId)) errors.push({ row, code: "unavailableSlotCategory" });
  });
  return errors.length ? { ok: false, errors } : { ok: true, slotCategoryIds };
}

// The slots with the one at `index` moved `offset` places (-1 up, 1 down). A
// slot already at the top or bottom stays put.
export function moveSlot<T>(slots: readonly T[], index: number, offset: -1 | 1): T[] {
  const target = index + offset;
  if (target < 0 || target >= slots.length) return [...slots];
  const moved = [...slots];
  [moved[index], moved[target]] = [moved[target]!, moved[index]!];
  return moved;
}

// Earliest hour first; "HH:MM" text sorts as time does. Ties go alphabetically
// by name, ignoring case.
export function sortMealTemplates<T extends { name: string; hour: string }>(templates: readonly T[]): T[] {
  return [...templates].sort(
    (a, b) => a.hour.localeCompare(b.hour) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}
