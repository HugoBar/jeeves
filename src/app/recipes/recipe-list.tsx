import Link from "next/link";
import { sortByName } from "@/core/names";
import type { Recipe } from "@/db/recipes";
import { formatPortions, formatRecipeCount, t } from "@/strings";
import type { CategoryOption } from "../categories/category-options";
import { FoodCategoryPill } from "../food-category-pill";
import { BackLink, LinkRow } from "../list-row";

type RecipeListRecipe = Pick<Recipe, "id" | "name" | "portions" | "prepTimeMinutes"> & { categoryIds: string[] };

// The Recipes list. Pills follow the order of `categories`, which also holds
// their labels.
export function RecipeList({ recipes, categories }: { recipes: RecipeListRecipe[]; categories: CategoryOption[] }) {
  return (
    <section className="page-wide">
      {/* On desktop Recipes is in the top menu; on phone it lives under More. */}
      <span className="phone-only">
        <BackLink href="/more">{t("nav.more")}</BackLink>
      </span>
      <div className="page-toolbar">
        <h1>
          {t("recipes.title")}
          {recipes.length > 0 && <span className="page-count">{formatRecipeCount(recipes.length)}</span>}
        </h1>
        <Link href="/recipes/new" className="button button-primary button-add">
          {t("recipes.add")}
        </Link>
      </div>
      {recipes.length === 0 ? (
        <div className="empty-state">
          <strong>{t("recipes.empty")}</strong>
          <p>{t("recipes.emptyHint")}</p>
          <Link href="/recipes/new" className="button button-primary">
            {t("recipes.add")}
          </Link>
        </div>
      ) : (
        <ul className="list recipe-list">
          <li className="recipe-list-head" aria-hidden="true">
            <span>{t("recipes.columnRecipe")}</span>
            <span>{t("recipes.columnCategories")}</span>
            <span>{t("recipes.columnPortions")}</span>
            <span>{t("recipes.columnPrepTime")}</span>
          </li>
          {sortByName(recipes).map((recipe) => (
            <li key={recipe.id}>
              <RecipeRow
                recipe={recipe}
                categories={categories.filter((category) => recipe.categoryIds.includes(category.id))}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecipeRow({ recipe, categories }: { recipe: RecipeListRecipe; categories: CategoryOption[] }) {
  const prepTime = t("recipes.prepTimeShort", { minutes: recipe.prepTimeMinutes });
  return (
    <LinkRow href={`/recipes/${recipe.id}`}>
      <span className="list-row-text">
        <span className="list-row-title">{recipe.name}</span>
        <span className="list-row-meta">
          {t("recipes.listMeta", { portions: formatPortions(recipe.portions), prepTime })}
        </span>
        {categories.length > 0 && (
          <span className="pills">
            {categories.map((category) => (
              <FoodCategoryPill key={category.id} label={category.label} />
            ))}
          </span>
        )}
      </span>
      {/* Desktop shows Portions and prep time in columns, in place of the meta line. */}
      <span className="recipe-list-portions">{recipe.portions}</span>
      <span className="recipe-list-prep-time">{prepTime}</span>
    </LinkRow>
  );
}
