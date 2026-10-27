import { sortCategories, type CategoryKind } from "@/core/food-categories";
import type { Db } from "@/db";
import { listActiveCategories } from "@/db/food-categories";
import { foodCategoryLabel } from "@/strings";

// A Food Category a picker offers, already labelled and sorted.
export interface CategoryOption {
  id: string;
  label: string;
  kind: CategoryKind;
}

// What Food Category pickers offer: every non-Archived Food Category.
export async function loadCategoryOptions(db: Db): Promise<CategoryOption[]> {
  return sortCategories(await listActiveCategories(db), foodCategoryLabel).map((category) => ({
    id: category.id,
    label: foodCategoryLabel(category),
    kind: category.kind,
  }));
}
