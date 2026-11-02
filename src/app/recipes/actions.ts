"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { parseIngredients, type IngredientError, type IngredientInput } from "@/core/ingredients";
import {
  parseCategoryOverrides,
  parseRecipeFields,
  type CategoryOverrideInput,
  type RecipeContent,
  type RecipeFieldError,
  type RecipeFieldsInput,
} from "@/core/recipes";
import { getDb } from "@/db";
import type { RemoveOutcome } from "@/db/archive";
import { createRecipe, listPickableProducts, removeRecipeIfStill, updateRecipe } from "@/db/recipes";

export type RecipeFormValues = RecipeFieldsInput & {
  ingredients: IngredientInput[];
  categoryOverrides: CategoryOverrideInput[];
};

// `values` refills the form after a rejected submit, which React resets.
export type RecipeFormState = {
  errors: RecipeFieldError[];
  ingredientErrors: IngredientError[];
  values: RecipeFormValues;
};

export async function createRecipeAction(_state: RecipeFormState, formData: FormData): Promise<RecipeFormState> {
  const values = valuesFrom(formData);
  const parsed = await parseRecipeForm(values);
  if (!parsed.ok) return { ...parsed.state, values };
  const recipe = await createRecipe(getDb(), parsed.content);
  redirect(`/recipes/${recipe.id}`);
}

export async function editRecipeAction(
  id: string,
  _state: RecipeFormState,
  formData: FormData,
): Promise<RecipeFormState> {
  const values = valuesFrom(formData);
  const parsed = await parseRecipeForm(values, id);
  if (!parsed.ok) return { ...parsed.state, values };
  await updateRecipe(getDb(), id, parsed.content);
  redirect(`/recipes/${id}`);
}

// `expected` is what the page said Remove would do. If that no longer holds,
// nothing is removed and the page refreshes to say what it would do now.
export async function removeRecipeAction(id: string, expected: RemoveOutcome): Promise<void> {
  if (await removeRecipeIfStill(getDb(), id, expected)) redirect("/recipes");
  refresh();
}

// Checks the Recipe's fields and its Ingredients together, so every error
// shows at once.
async function parseRecipeForm(values: RecipeFormValues, recipeId?: string) {
  const products = await listPickableProducts(getDb(), recipeId);
  const fields = parseRecipeFields(values);
  const ingredients = parseIngredients(values.ingredients, new Map(products.map((p) => [p.id, p])));
  if (!fields.ok || !ingredients.ok) {
    return {
      ok: false as const,
      state: {
        errors: fields.ok ? [] : fields.errors,
        ingredientErrors: ingredients.ok ? [] : ingredients.errors,
      },
    };
  }
  const content: RecipeContent = {
    ...fields.fields,
    ingredients: ingredients.ingredients,
    categoryOverrides: parseCategoryOverrides(values.categoryOverrides),
  };
  return { ok: true as const, content };
}

// Ingredient rows submit their fields in order. An unticked Minor checkbox
// submits nothing, so each ticked one submits its row's index. Each category
// in the overrides picker submits its id and its mode, in order.
function valuesFrom(formData: FormData): RecipeFormValues {
  const text = (key: string) => String(formData.get(key) ?? "");
  const all = (key: string) => formData.getAll(key).map(String);
  const amounts = all("ingredientAmount");
  const units = all("ingredientUnit");
  const minor = all("ingredientMinor");
  const overrideModes = all("overrideMode");
  return {
    name: text("name"),
    portions: text("portions"),
    steps: text("steps"),
    prepTimeMinutes: text("prepTimeMinutes"),
    sourceUrl: text("sourceUrl"),
    ingredients: all("ingredientProductId").map((productId, index) => ({
      productId,
      amount: amounts[index] ?? "",
      unit: units[index] ?? "",
      minor: minor.includes(String(index)),
    })),
    categoryOverrides: all("overrideCategoryId").map((categoryId, index) => ({
      categoryId,
      mode: overrideModes[index] ?? "",
    })),
  };
}
