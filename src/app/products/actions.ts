"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import {
  densityBlockers,
  parseProductFields,
  type IngredientUse,
  type ProductFieldError,
  type ProductFieldsInput,
} from "@/core/products";
import { parseDefaultUnit } from "@/core/units";
import { getDb } from "@/db";
import type { RemoveOutcome } from "@/db/archive";
import { createProduct, getProduct, removeProductIfStill, updateProduct } from "@/db/products";
import { listIngredientUses } from "@/db/recipes";

export type ProductFormValues = ProductFieldsInput & { defaultUnit?: string };

export type ProductFormError = ProductFieldError | "duplicateName" | "densityInUse";

// `values` refills the form after a rejected submit, which React resets.
// `densityUses` holds the Ingredients that stopped the Density being cleared.
export type ProductFormState = { errors: ProductFormError[]; values: ProductFormValues; densityUses?: IngredientUse[] };

export async function createProductAction(
  _state: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const values = valuesFrom(formData);
  const parsed = parseProductFields(values);
  if (!parsed.ok) return { errors: parsed.errors, values };
  // The form only offers the Default Units, so anything else is a crafted request.
  const defaultUnit = parseDefaultUnit(values.defaultUnit);
  if (!defaultUnit) throw new Error("Invalid Default Unit");
  const result = await createProduct(getDb(), { ...parsed.fields, defaultUnit });
  if (!result.ok) return { errors: [result.error], values };
  redirect("/products");
}

export async function editProductAction(
  id: string,
  _state: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const values = valuesFrom(formData);
  const parsed = parseProductFields(values);
  if (!parsed.ok) return { errors: parsed.errors, values };
  const db = getDb();
  // Clearing a Density Recipes still convert with would leave them unable to.
  if (parsed.fields.density === null) {
    const product = await getProduct(db, id);
    const densityUses = product ? densityBlockers(product.defaultUnit, await listIngredientUses(db, id)) : [];
    if (densityUses.length > 0) return { errors: ["densityInUse"], values, densityUses };
  }
  const result = await updateProduct(db, id, parsed.fields);
  if (!result.ok) return { errors: [result.error], values };
  redirect(`/products/${id}`);
}

// `expected` is what the page said Remove would do. If that no longer holds,
// nothing is removed and the page refreshes to say what it would do now.
export async function removeProductAction(id: string, expected: RemoveOutcome): Promise<void> {
  if (await removeProductIfStill(getDb(), id, expected)) redirect("/products");
  refresh();
}

function valuesFrom(formData: FormData): ProductFormValues {
  const text = (key: string) => String(formData.get(key) ?? "");
  return {
    name: text("name"),
    density: text("density"),
    packSizeName: text("packSizeName"),
    packSizeAmount: text("packSizeAmount"),
    defaultUnit: text("defaultUnit"),
    categoryIds: formData.getAll("categoryIds").map(String),
  };
}
