import { parseWholeAboveZero } from "@/core/amounts";

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

export type MealTypeFieldError = "blankName" | "invalidPriority";

export type MealTypeFieldsResult =
  | { ok: true; fields: MealTypeFields }
  | { ok: false; errors: MealTypeFieldError[] };

export function parseMealTypeFields(input: MealTypeFieldsInput): MealTypeFieldsResult {
  const name = input.name.trim();
  const priority = parseWholeAboveZero(input.priority.trim());

  const errors: MealTypeFieldError[] = [];
  if (!name) errors.push("blankName");
  if (priority === null) errors.push("invalidPriority");
  if (errors.length) return { ok: false, errors };

  return { ok: true, fields: { name, priority: priority!, allowsLeftovers: input.allowsLeftovers } };
}

// Meal Priority first (1 first), then alphabetical by the label the user sees.
export function sortMealTypes<T extends { priority: number }>(
  mealTypes: readonly T[],
  labelOf: (mealType: T) => string,
): T[] {
  return [...mealTypes].sort(
    (a, b) => a.priority - b.priority || labelOf(a).localeCompare(labelOf(b), undefined, { sensitivity: "base" }),
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
