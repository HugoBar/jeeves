"use server";

import { redirect } from "next/navigation";
import { parseRecipeFields, type RecipeFieldError, type RecipeFieldsInput } from "@/core/recipes";
import { getDb } from "@/db";
import { createRecipe, updateRecipe } from "@/db/recipes";

// `values` refills the form after a rejected submit, which React resets.
export type RecipeFormState = { errors: RecipeFieldError[]; values: RecipeFieldsInput };

export async function createRecipeAction(_state: RecipeFormState, formData: FormData): Promise<RecipeFormState> {
  const values = valuesFrom(formData);
  const parsed = parseRecipeFields(values);
  if (!parsed.ok) return { errors: parsed.errors, values };
  const recipe = await createRecipe(getDb(), parsed.fields);
  redirect(`/recipes/${recipe.id}`);
}

export async function editRecipeAction(
  id: string,
  _state: RecipeFormState,
  formData: FormData,
): Promise<RecipeFormState> {
  const values = valuesFrom(formData);
  const parsed = parseRecipeFields(values);
  if (!parsed.ok) return { errors: parsed.errors, values };
  await updateRecipe(getDb(), id, parsed.fields);
  redirect(`/recipes/${id}`);
}

function valuesFrom(formData: FormData): RecipeFieldsInput {
  const text = (key: string) => String(formData.get(key) ?? "");
  return {
    name: text("name"),
    portions: text("portions"),
    steps: text("steps"),
    prepTimeMinutes: text("prepTimeMinutes"),
    sourceUrl: text("sourceUrl"),
  };
}
