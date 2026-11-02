import { notFound } from "next/navigation";
import { isUuid } from "@/core/uuid";
import { getDb } from "@/db";
import { getRecipe, getRecipeFoodCategories, listRecipeIngredients } from "@/db/recipes";
import { removeRecipeAction } from "../actions";
import { RecipeView } from "../recipe-view";

// A Recipe's page.
export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const db = getDb();
  const recipe = await getRecipe(db, id);
  if (!recipe) notFound();
  const [ingredients, foodCategories] = await Promise.all([
    listRecipeIngredients(db, id),
    getRecipeFoodCategories(db, id),
  ]);

  return (
    <RecipeView
      recipe={recipe}
      ingredients={ingredients}
      foodCategories={foodCategories.final}
      remove={removeRecipeAction.bind(null, id)}
    />
  );
}
