"use server";

import { redirect } from "next/navigation";
import { parseProductFields, type ProductFieldError, type ProductFieldsInput } from "@/core/products";
import { parseDefaultUnit } from "@/core/units";
import { getDb } from "@/db";
import { createProduct, updateProduct } from "@/db/products";

export type ProductFormValues = ProductFieldsInput & { defaultUnit?: string };

export type ProductFormError = ProductFieldError | "duplicateName";

// `values` refills the form after a rejected submit, which React resets.
export type ProductFormState = { errors: ProductFormError[]; values: ProductFormValues };

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
  const result = await updateProduct(getDb(), id, parsed.fields);
  if (!result.ok) return { errors: [result.error], values };
  redirect("/products");
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
