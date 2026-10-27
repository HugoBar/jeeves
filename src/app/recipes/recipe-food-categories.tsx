import { sortCategories } from "@/core/food-categories";
import type { FoodCategory } from "@/db/food-categories";
import { foodCategoryLabel, t } from "@/strings";

// A set of a Recipe's Food Categories, with where it comes from: Roles first,
// then Kinds, each alphabetical.
export function RecipeFoodCategories({
  categories,
  heading,
  source,
}: {
  categories: FoodCategory[];
  heading: string;
  source: string;
}) {
  return (
    <>
      <h2>{heading}</h2>
      <p>{source}</p>
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
