import { isWholeTooLarge, parseWholeAboveZero } from "@/core/amounts";
import { isTooLong, NAME_MAX_LENGTH } from "@/core/names";

// What the user can set on a Meal Type. Meal Priority ranks Meals on the same
// day that compete for the same Stock: 1 is served first.
export interface MealTypeFields {
  name: string;
  priority: number;
  allowsLeftovers: boolean;
}

// Raw values from the Meal Type form.
export interface MealTypeFieldsInput {
  name: string;
  priority: string;
  allowsLeftovers: boolean;
}

export type MealTypeFieldError = "blankName" | "nameTooLong" | "invalidPriority" | "priorityTooLarge";

export type MealTypeFieldsResult =
  | { ok: true; fields: MealTypeFields }
  | { ok: false; errors: MealTypeFieldError[] };

export function parseMealTypeFields(input: MealTypeFieldsInput): MealTypeFieldsResult {
  const name = input.name.trim();
  const priority = parseWholeAboveZero(input.priority.trim());

  const errors: MealTypeFieldError[] = [];
  if (!name) errors.push("blankName");
  else if (isTooLong(name, NAME_MAX_LENGTH)) errors.push("nameTooLong");
  if (priority === null) errors.push(isWholeTooLarge(input.priority) ? "priorityTooLarge" : "invalidPriority");
  if (errors.length) return { ok: false, errors };

  return { ok: true, fields: { name, priority: priority!, allowsLeftovers: input.allowsLeftovers } };
}

// Lists read in the order of a day: by each Meal Type's usual hour, in
// minutes after midnight, then by the label the user sees. Meal Priority
// orders Meals for Projected Stock, never lists.
export function sortMealTypes<T extends { id: string; seedKey: MealTypeSeedKey | null }>(
  mealTypes: readonly T[],
  usualMinutes: ReadonlyMap<string, number>,
  labelOf: (mealType: T) => string,
): T[] {
  // An added Meal Type with no Meals has no usual hour and goes last.
  const minutesOf = (mealType: T) =>
    usualMinutes.get(mealType.id) ?? (mealType.seedKey ? SEED_USUAL_MINUTES[mealType.seedKey] : Infinity);
  const byHour = (a: T, b: T) => (minutesOf(a) === minutesOf(b) ? 0 : minutesOf(a) - minutesOf(b));
  return [...mealTypes].sort(
    (a, b) => byHour(a, b) || labelOf(a).localeCompare(labelOf(b), undefined, { sensitivity: "base" }),
  );
}

// Seeded on first run and stored by key; the label comes from the UI strings
// file until the user renames it.
export const SEED_MEAL_TYPES = [
  { seedKey: "breakfast", priority: 2, allowsLeftovers: false },
  { seedKey: "lunch", priority: 1, allowsLeftovers: true },
  { seedKey: "snack", priority: 3, allowsLeftovers: false },
  { seedKey: "dinner", priority: 1, allowsLeftovers: true },
] as const satisfies readonly ({ seedKey: string } & Omit<MealTypeFields, "name">)[];

export type MealTypeSeedKey = (typeof SEED_MEAL_TYPES)[number]["seedKey"];

// A seeded Meal Type's usual hour, in minutes after midnight, until it has
// Meals of its own.
const SEED_USUAL_MINUTES: Record<MealTypeSeedKey, number> = {
  breakfast: 8 * 60,
  lunch: 13 * 60,
  snack: 16 * 60,
  dinner: 20 * 60,
};
