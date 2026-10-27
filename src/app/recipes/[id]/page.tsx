import Link from "next/link";
import { notFound } from "next/navigation";
import Markdown from "react-markdown";
import { getDb } from "@/db";
import { getRecipe, listRecipeIngredients } from "@/db/recipes";
import { formatQuantity, t } from "@/strings";
import { RemoveButton } from "../../remove-button";
import { removeRecipeAction } from "../actions";
import { isUuid } from "../../uuid";

// A Recipe: its Portions, prep time, source, Ingredients and steps.
export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const recipe = await getRecipe(getDb(), id);
  if (!recipe) notFound();
  const ingredients = await listRecipeIngredients(getDb(), id);

  return (
    <section>
      <h1>{recipe.name}</h1>
      <p>
        <Link href={`/recipes/${recipe.id}/edit`}>{t("recipes.edit")}</Link>
      </p>
      <RemoveButton
        action={removeRecipeAction.bind(null, recipe.id)}
        label={t("recipes.remove")}
        confirmMessage={t("recipes.removeConfirm", { name: recipe.name })}
      />
      <p>{t("recipes.portionsCount", { portions: recipe.portions })}</p>
      <p>{t("recipes.prepTimeMinutes", { minutes: recipe.prepTimeMinutes })}</p>
      {recipe.sourceUrl !== null && (
        <p>
          <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer">
            {t("recipes.source")}
          </a>
        </p>
      )}
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
        <Markdown>{recipe.steps}</Markdown>
      )}
    </section>
  );
}
