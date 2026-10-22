"use server";

import { refresh } from "next/cache";
import { parseCategoryKind, parseCategoryName, type CategoryKind } from "@/core/food-categories";
import { getDb } from "@/db";
import { createCategory, getCategory, removeCategory, updateCategory } from "@/db/food-categories";
import { foodCategoryLabel } from "@/strings";

export type CategoryFormState = { error: "blank" | null };

export async function createCategoryAction(
  _state: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const parsed = parseCategoryName(String(formData.get("name") ?? ""));
  if (!parsed.ok) return { error: parsed.error };
  await createCategory(getDb(), { name: parsed.name, kind: kindFrom(formData) });
  refresh();
  return { error: null };
}

export async function editCategoryAction(
  id: string,
  _state: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const parsed = parseCategoryName(String(formData.get("name") ?? ""));
  if (!parsed.ok) return { error: parsed.error };
  const db = getDb();
  const category = await getCategory(db, id);
  if (!category) throw new Error("Category not found");
  // The form starts with the shown label, so an untouched name is no rename and
  // a seeded category keeps following its key's string.
  const name = parsed.name === foodCategoryLabel(category) ? category.name : parsed.name;
  await updateCategory(db, id, { name, kind: kindFrom(formData) });
  refresh();
  return { error: null };
}

export async function removeCategoryAction(id: string): Promise<void> {
  await removeCategory(getDb(), id);
  refresh();
}

// The form only offers Role and Kind, so anything else is a crafted request.
function kindFrom(formData: FormData): CategoryKind {
  const kind = parseCategoryKind(formData.get("kind"));
  if (!kind) throw new Error("Invalid category kind");
  return kind;
}
