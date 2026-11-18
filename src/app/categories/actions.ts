"use server";

import { refresh } from "next/cache";
import { parseCategoryName, type CategoryKind, type CategoryNameError } from "@/core/food-categories";
import { requireOneOf, requireText, requireUuid } from "@/core/request";
import { getDb } from "@/db";
import { createCategory, getCategory, removeCategory, updateCategory } from "@/db/food-categories";
import { foodCategoryLabel } from "@/strings";

export type CategoryFormState = { error: CategoryNameError | null };

export async function createCategoryAction(
  _state: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const parsed = parseCategoryName(requireText(formData.get("name")));
  const kind = kindFrom(formData);
  if (!parsed.ok) return { error: parsed.error };
  await createCategory(getDb(), { name: parsed.name, kind });
  refresh();
  return { error: null };
}

// A category removed meanwhile has nothing to edit; the refresh shows it gone.
export async function editCategoryAction(
  id: string,
  _state: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  requireUuid(id);
  const parsed = parseCategoryName(requireText(formData.get("name")));
  const kind = kindFrom(formData);
  if (!parsed.ok) return { error: parsed.error };
  const db = getDb();
  const category = await getCategory(db, id);
  if (!category) {
    refresh();
    return { error: null };
  }
  // The form starts with the shown label, so an untouched name is no rename and
  // a seeded category keeps following its key's string.
  const name = parsed.name === foodCategoryLabel(category) ? category.name : parsed.name;
  await updateCategory(db, id, { name, kind });
  refresh();
  return { error: null };
}

export async function removeCategoryAction(id: string): Promise<void> {
  await removeCategory(getDb(), requireUuid(id));
  refresh();
}

// The form only offers Role and Kind, so anything else is a crafted request.
function kindFrom(formData: FormData): CategoryKind {
  return requireOneOf(formData.get("kind"), ["role", "kind"] as const);
}
