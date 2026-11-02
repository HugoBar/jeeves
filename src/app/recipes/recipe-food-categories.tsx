import { sortCategories } from "@/core/food-categories";
import type { FoodCategory } from "@/db/food-categories";
import { foodCategoryLabel, t } from "@/strings";
import { FoodCategoryPill } from "../food-category-pill";

// A Recipe's Food Categories as pills, Roles first, then Kinds, each
// alphabetical, or a note that it has none.
export function RecipeCategoryPills({
  categories,
}: {
  categories: Pick<FoodCategory, "id" | "kind" | "name" | "seedKey">[];
}) {
  return categories.length === 0 ? (
    <p>{t("recipes.foodCategoriesEmpty")}</p>
  ) : (
    <ul className="pills">
      {sortCategories(categories, foodCategoryLabel).map((category) => (
        <li key={category.id}>
          <FoodCategoryPill label={foodCategoryLabel(category)} />
        </li>
      ))}
    </ul>
  );
}
