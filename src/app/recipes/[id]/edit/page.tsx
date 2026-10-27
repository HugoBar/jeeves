import { notFound } from "next/navigation";
import { toIngredientInput } from "@/core/ingredients";
import { toRecipeFieldsInput } from "@/core/recipes";
import { isUuid } from "@/core/uuid";
import { getDb } from "@/db";
import {
  getRecipe,
  getRecipeFoodCategories,
  listPickableProducts,
  listRecipeCategoryOverrides,
  listRecipeIngredients,
} from "@/db/recipes";
import { t } from "@/strings";
import { loadCategoryOptions } from "../../../categories/category-options";
import { editRecipeAction } from "../../actions";
import { RecipeFoodCategories } from "../../recipe-food-categories";
import { RecipeForm } from "../../recipe-form";

// The Food Categories are shown as last saved, since they don't follow the
// form until it is saved.
export default async function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const recipe = await getRecipe(getDb(), id);
  if (!recipe) notFound();
  const [ingredients, products, categories, overrides, foodCategories] = await Promise.all([
    listRecipeIngredients(getDb(), id),
    listPickableProducts(getDb(), id),
    loadCategoryOptions(getDb()),
    listRecipeCategoryOverrides(getDb(), id),
    getRecipeFoodCategories(getDb(), id),
  ]);

  return (
    <section>
      <h1>{t("recipes.editTitle", { name: recipe.name })}</h1>
      <RecipeForm
        action={editRecipeAction.bind(null, recipe.id)}
        initialValues={{
          ...toRecipeFieldsInput(recipe),
          ingredients: ingredients.map(toIngredientInput),
          categoryOverrides: overrides,
        }}
        products={products}
        categories={categories}
        submitLabel={t("recipes.save")}
        cancelHref={`/recipes/${recipe.id}`}
      />
      <RecipeFoodCategories
        categories={foodCategories.derived}
        heading={t("recipes.derivedFoodCategories")}
        source={t("recipes.derivedFoodCategoriesSource")}
      />
      <RecipeFoodCategories
        categories={foodCategories.final}
        heading={t("recipes.finalFoodCategories")}
        source={t("recipes.finalFoodCategoriesSource")}
      />
    </section>
  );
}
