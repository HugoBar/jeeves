import { parseWholeAboveZero } from "@/core/amounts";

// What the user can set on a Recipe. Ingredients and Food Categories are
// edited separately.
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
