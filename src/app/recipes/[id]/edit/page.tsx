import { notFound } from "next/navigation";
import { toIngredientInput } from "@/core/ingredients";
import { toRecipeFieldsInput } from "@/core/recipes";
import { isUuid } from "@/core/uuid";
import { getDb } from "@/db";
import { getRecipe, listPickableProducts, listRecipeCategoryOverrides, listRecipeIngredients } from "@/db/recipes";
import { t } from "@/strings";
import { loadCategoryOptions } from "../../../categories/category-options";
import { BackLink } from "../../../list-row";
import { editRecipeAction } from "../../actions";
import { RecipeForm } from "../../recipe-form";

export default async function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const recipe = await getRecipe(getDb(), id);
  if (!recipe) notFound();
  const [ingredients, products, categories, overrides] = await Promise.all([
    listRecipeIngredients(getDb(), id),
    listPickableProducts(getDb(), id),
    loadCategoryOptions(getDb()),
    listRecipeCategoryOverrides(getDb(), id),
  ]);

  return (
    <section className="page-form recipe-form-page">
      <BackLink href={`/recipes/${recipe.id}`}>{recipe.name}</BackLink>
      <div className="page-toolbar">
        <h1>{t("recipes.editRecipe")}</h1>
      </div>
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
        editing
        cancelHref={`/recipes/${recipe.id}`}
      />
    </section>
  );
}
