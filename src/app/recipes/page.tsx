import { connection } from "next/server";
import { getDb } from "@/db";
import { finalCategoryIdsByRecipe, listActiveRecipes } from "@/db/recipes";
import { loadCategoryOptions } from "../categories/category-options";
import { RecipeList } from "./recipe-list";

// The Recipes list.
export default async function RecipesPage() {
  // Read from the database on every request, never at build time.
  await connection();
  const db = getDb();
  const [recipes, categories] = await Promise.all([listActiveRecipes(db), loadCategoryOptions(db)]);
  const categoryIds = await finalCategoryIdsByRecipe(
    db,
    recipes.map((recipe) => recipe.id),
  );

  return (
    <RecipeList
      recipes={recipes.map((recipe) => ({ ...recipe, categoryIds: categoryIds.get(recipe.id)! }))}
      categories={categories}
    />
  );
}
