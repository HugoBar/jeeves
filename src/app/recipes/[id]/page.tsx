import Link from "next/link";
import { notFound } from "next/navigation";
import Markdown from "react-markdown";
import { isUuid } from "@/core/uuid";
import { getDb } from "@/db";
import { getRecipe, getRecipeFoodCategories, listRecipeIngredients } from "@/db/recipes";
import { formatQuantity, t } from "@/strings";
import { RemoveButton } from "../../remove-button";
import { removeRecipeAction } from "../actions";
import { RecipeFoodCategories } from "../recipe-food-categories";

// A Recipe: its Portions, prep time, source, Food Categories, Ingredients and
// steps.
export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const recipe = await getRecipe(getDb(), id);
  if (!recipe) notFound();
  const [ingredients, foodCategories] = await Promise.all([
    listRecipeIngredients(getDb(), id),
    getRecipeFoodCategories(getDb(), id),
  ]);

  return (
    <section>
      <h1>{recipe.name}</h1>
      <p>
        <Link href={`/recipes/${recipe.id}/edit`} className="button">
          {t("recipes.edit")}
        </Link>
      </p>
      <RemoveButton
        action={removeRecipeAction.bind(null, recipe.id)}
        label={t("recipes.remove")}
        title={t("recipes.removeConfirm", { name: recipe.name })}
        body={t("recipes.removeConfirmBody")}
      />
      <p>{t("recipes.portionsCount", { portions: recipe.portions })}</p>
      <p>{t("recipes.prepTimeMinutes", { minutes: recipe.prepTimeMinutes })}</p>
      {recipe.sourceUrl !== null && (
        <p>
          <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer" className="button button-quiet">
            {t("recipes.source")}
          </a>
        </p>
      )}
      <RecipeFoodCategories
        categories={foodCategories.final}
        heading={t("recipes.foodCategories")}
        source={t("recipes.foodCategoriesSource")}
      />
      <h2>{t("recipes.ingredients")}</h2>
      {ingredients.length === 0 ? (
        <p>{t("recipes.ingredientsEmpty")}</p>
      ) : (
        <ul>
          {ingredients.map((ingredient, index) => (
            <li key={index}>
              {t("recipes.ingredientLine", {
                amount: formatQuantity(ingredient.amount, ingredient.unit),
                product: ingredient.productName,
              })}
              {ingredient.minor && <> {t("recipes.ingredientMinorTag")}</>}
            </li>
          ))}
        </ul>
      )}
      <h2>{t("recipes.steps")}</h2>
      {recipe.steps.trim() === "" ? (
        <p>{t("recipes.stepsEmpty")}</p>
      ) : (
        // react-markdown escapes raw HTML and drops unsafe link URLs.
        <div className="recipe-steps">
          <Markdown>{recipe.steps}</Markdown>
        </div>
      )}
    </section>
  );
}
