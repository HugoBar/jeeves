import { parseWholeAboveZero } from "@/core/amounts";
import type { Ingredient } from "@/core/ingredients";

// What the user can set on a Recipe itself. Its Ingredients and Food Category
// overrides are saved with it, as RecipeContent.
export interface RecipeFields {
  name: string;
  // How many Portions the Recipe is written for.
  portions: number;
  // Markdown.
  steps: string;
  prepTimeMinutes: number;
  sourceUrl: string | null;
}

// Raw text from the Recipe form.
export interface RecipeFieldsInput {
  name: string;
  portions: string;
  steps: string;
  prepTimeMinutes: string;
  sourceUrl: string;
}

export type RecipeFieldError = "blankName" | "invalidPortions" | "invalidPrepTime" | "invalidSourceUrl";

export type RecipeFieldsResult =
  | { ok: true; fields: RecipeFields }
  | { ok: false; errors: RecipeFieldError[] };

export function parseRecipeFields(input: RecipeFieldsInput): RecipeFieldsResult {
  const name = input.name.trim();
  const portions = parseWholeAboveZero(input.portions.trim());
  const prepTimeMinutes = parseWholeAboveZero(input.prepTimeMinutes.trim());
  const sourceUrl = input.sourceUrl.trim();

  const errors: RecipeFieldError[] = [];
  if (!name) errors.push("blankName");
  if (portions === null) errors.push("invalidPortions");
  if (prepTimeMinutes === null) errors.push("invalidPrepTime");
  if (sourceUrl && !isWebAddress(sourceUrl)) errors.push("invalidSourceUrl");
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    fields: {
      name,
      portions: portions!,
      steps: input.steps,
      prepTimeMinutes: prepTimeMinutes!,
      sourceUrl: sourceUrl || null,
    },
  };
}

// The form's text for a Recipe's current fields: the inverse of parseRecipeFields.
export function toRecipeFieldsInput({ name, portions, steps, prepTimeMinutes, sourceUrl }: RecipeFields): RecipeFieldsInput {
  return {
    name,
    portions: portions.toString(),
    steps,
    prepTimeMinutes: prepTimeMinutes.toString(),
    sourceUrl: sourceUrl ?? "",
  };
}

// The source URL is shown as a link, so anything but http(s), such as a
// `javascript:` URL, is refused.
function isWebAddress(text: string): boolean {
  try {
    const { protocol } = new URL(text);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

// A Recipe's Food Categories, computed on read and never stored: the union of
// its non-Minor Ingredients' Products' Food Categories, each once. Minor
// Ingredients contribute nothing.
export function deriveFoodCategoryIds(
  ingredients: readonly { minor: boolean; categoryIds: readonly string[] }[],
): string[] {
  const ids = new Set<string>();
  for (const ingredient of ingredients) {
    if (!ingredient.minor) for (const id of ingredient.categoryIds) ids.add(id);
  }
  return [...ids];
}

export const CATEGORY_OVERRIDE_MODES = ["add", "remove"] as const;

export type CategoryOverrideMode = (typeof CATEGORY_OVERRIDE_MODES)[number];

// A per-Recipe adjustment to its derived Food Categories, stored apart from
// the Ingredients so it survives Ingredient edits.
export interface CategoryOverride {
  categoryId: string;
  mode: CategoryOverrideMode;
}

// A Recipe's final Food Categories: the derived set, plus "add" overrides,
// minus "remove" overrides. Computed on read, never stored.
export function applyCategoryOverrides(
  derivedIds: readonly string[],
  overrides: readonly CategoryOverride[],
): string[] {
  const ids = new Set(derivedIds);
  for (const { categoryId, mode } of overrides) {
    if (mode === "add") ids.add(categoryId);
    else ids.delete(categoryId);
  }
  return [...ids];
}

// Raw values from one category of the overrides picker; an empty mode leaves
// the category to follow the Ingredients.
export interface CategoryOverrideInput {
  categoryId: string;
  mode: string;
}

export function parseCategoryOverrides(inputs: readonly CategoryOverrideInput[]): CategoryOverride[] {
  const overrides: CategoryOverride[] = [];
  for (const { categoryId, mode } of inputs) {
    if (mode === "") continue;
    // The form only offers these modes, so anything else is a crafted request.
    const parsed = CATEGORY_OVERRIDE_MODES.find((known) => known === mode);
    if (!parsed) throw new RangeError(`Not a Food Category override mode: ${mode}`);
    overrides.push({ categoryId, mode: parsed });
  }
  return overrides;
}

// Everything saving a Recipe stores, already checked: its fields, its
// Ingredients in order, and its Food Category overrides.
export interface RecipeContent extends RecipeFields {
  ingredients: Ingredient[];
  categoryOverrides: CategoryOverride[];
}
