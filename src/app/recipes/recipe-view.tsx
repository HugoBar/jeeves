import Link from "next/link";
import Markdown from "react-markdown";
import type { RemoveOutcome } from "@/db/archive";
import type { FoodCategory } from "@/db/food-categories";
import type { Recipe, RecipeIngredient } from "@/db/recipes";
import { formatPortions, formatQuantity, t } from "@/strings";
import { BackLink } from "../list-row";
import { RemoveCard } from "../remove-card";
import { RecipeCategoryPills } from "./recipe-food-categories";

type RecipeCategory = Pick<FoodCategory, "id" | "kind" | "name" | "seedKey">;

// A Recipe: its Portions, prep time and Source, its Food Categories,
// Ingredients and steps, and Remove. `removeOutcome` is what Remove would do,
// and `remove` is already bound to its id and that outcome.
export function RecipeView({
  recipe,
  ingredients,
  foodCategories,
  removeOutcome,
  remove,
}: {
  recipe: Recipe;
  ingredients: RecipeIngredient[];
  foodCategories: RecipeCategory[];
  removeOutcome: RemoveOutcome;
  remove: () => Promise<void>;
}) {
  return (
    <section className="page-wide">
      <BackLink href="/recipes">{t("recipes.title")}</BackLink>
      <div className="recipe-heading">
        <h1>{recipe.name}</h1>
        <Link href={`/recipes/${recipe.id}/edit`} className="button">
          <span className="phone-only">{t("recipes.edit")}</span>
          <span className="desktop-only">{t("recipes.editRecipe")}</span>
        </Link>
        <p className="recipe-facts">
          <span>{formatPortions(recipe.portions)}</span>
          <span>{t("recipes.prepTimeShort", { minutes: recipe.prepTimeMinutes })}</span>
          {recipe.sourceUrl !== null && (
            <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer">
              {t("recipes.source")}
              <span aria-hidden="true">{t("recipes.sourceArrow")}</span>
            </a>
          )}
        </p>
      </div>
      <div className="recipe-columns">
        <FoodCategoriesCard categories={foodCategories} />
        <div className="recipe-main">
          <IngredientsCard ingredients={ingredients} />
          <StepsCard steps={recipe.steps} />
        </div>
        <RemoveCard
          className="recipe-remove"
          name={recipe.name}
          outcome={removeOutcome}
          inUse={t("recipes.removeInUse", { name: recipe.name })}
          archiveEffects={[
            { tone: "gone", text: t("recipes.archiveLeaves") },
            { tone: "kept", text: t("recipes.archivePastMeals") },
            { tone: "warn", text: t("recipes.archiveMeals") },
          ]}
          action={remove}
        />
      </div>
    </section>
  );
}

// On phone it sits under the title without a card, so its heading is only for
// screen readers there.
function FoodCategoriesCard({ categories }: { categories: RecipeCategory[] }) {
  return (
    <div className="card recipe-categories">
      <h2>{t("recipes.foodCategories")}</h2>
      <RecipeCategoryPills categories={categories} />
      <p className="recipe-categories-source">{t("recipes.foodCategoriesSource")}</p>
    </div>
  );
}

function IngredientsCard({ ingredients }: { ingredients: RecipeIngredient[] }) {
  return (
    <div className="card recipe-ingredients">
      <h2 className="card-heading">{t("recipes.ingredients")}</h2>
      {ingredients.length === 0 ? (
        <p className="recipe-card-empty">{t("recipes.ingredientsEmpty")}</p>
      ) : (
        <>
          <ul>
            {ingredients.map((ingredient, index) => (
              <li key={index} className="recipe-ingredient">
                <span>
                  {ingredient.productName}
                  {ingredient.minor && (
                    <>
                      {" "}
                      <span className="tag">{t("recipes.ingredientMinorTag")}</span>
                    </>
                  )}
                </span>
                <span>{formatQuantity(ingredient.amount, ingredient.unit)}</span>
              </li>
            ))}
          </ul>
          <p className="recipe-minor-note">{t("recipes.minorNote")}</p>
        </>
      )}
    </div>
  );
}

function StepsCard({ steps }: { steps: string }) {
  return (
    <div className="card recipe-steps">
      <h2>{t("recipes.steps")}</h2>
      {steps.trim() === "" ? (
        <p className="recipe-card-empty">{t("recipes.stepsEmpty")}</p>
      ) : (
        // react-markdown escapes raw HTML and drops unsafe link URLs.
        <Markdown>{steps}</Markdown>
      )}
    </div>
  );
}
