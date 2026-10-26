import { notFound } from "next/navigation";
import { toRecipeFieldsInput } from "@/core/recipes";
import { getDb } from "@/db";
import { getRecipe } from "@/db/recipes";
import { t } from "@/strings";
import { isUuid } from "../../../uuid";
import { editRecipeAction } from "../../actions";
import { RecipeForm } from "../../recipe-form";

export default async function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const recipe = await getRecipe(getDb(), id);
  if (!recipe) notFound();

  return (
    <section>
      <h1>{t("recipes.editTitle", { name: recipe.name })}</h1>
      <RecipeForm
        action={editRecipeAction.bind(null, recipe.id)}
        initialValues={toRecipeFieldsInput(recipe)}
        submitLabel={t("recipes.save")}
        cancelHref={`/recipes/${recipe.id}`}
      />
    </section>
  );
}
