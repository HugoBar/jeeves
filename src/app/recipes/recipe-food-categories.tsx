import { sortCategories } from "@/core/food-categories";
import type { FoodCategory } from "@/db/food-categories";
import { foodCategoryLabel, t } from "@/strings";
import { FoodCategoryPill } from "../food-category-pill";

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
        <ul className="pills">
          {sortCategories(categories, foodCategoryLabel).map((category) => (
            <li key={category.id}>
              <FoodCategoryPill label={foodCategoryLabel(category)} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
