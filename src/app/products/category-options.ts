import { sortCategories } from "@/core/food-categories";
import type { Db } from "@/db";
import { listActiveCategories } from "@/db/food-categories";
import { foodCategoryLabel } from "@/strings";
import type { CategoryOption } from "./product-form";

// What the Product form's picker offers: every non-Archived Food Category.
export async function loadCategoryOptions(db: Db): Promise<CategoryOption[]> {
  return sortCategories(await listActiveCategories(db), foodCategoryLabel).map((category) => ({
    id: category.id,
    label: foodCategoryLabel(category),
    kind: category.kind,
  }));
}
