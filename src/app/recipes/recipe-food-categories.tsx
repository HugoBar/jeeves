import { sortCategories } from "@/core/food-categories";
import type { FoodCategory } from "@/db/food-categories";
import { foodCategoryLabel, t } from "@/strings";

// A Recipe's derived Food Categories: Roles first, then Kinds, each
// alphabetical. The edit screen shows them `asLastSaved`, since they don't
// follow the form until it is saved.
export function RecipeFoodCategories({
  categories,
  asLastSaved = false,
}: {
  categories: FoodCategory[];
  asLastSaved?: boolean;
}) {
  return (
    <>
      <h2>{t("recipes.foodCategories")}</h2>
      <p>{t(asLastSaved ? "recipes.foodCategoriesSourceSaved" : "recipes.foodCategoriesSource")}</p>
      {categories.length === 0 ? (
        <p>{t("recipes.foodCategoriesEmpty")}</p>
      ) : (
        <ul>
          {sortCategories(categories, foodCategoryLabel).map((category) => (
            <li key={category.id}>{foodCategoryLabel(category)}</li>
          ))}
        </ul>
      )}
    </>
  );
}
