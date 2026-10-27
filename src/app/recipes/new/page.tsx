import { getDb } from "@/db";
import { listPickableProducts } from "@/db/recipes";
import { t } from "@/strings";
import { createRecipeAction } from "../actions";
import { RecipeForm } from "../recipe-form";

export default async function NewRecipePage() {
  const products = await listPickableProducts(getDb());

  return (
    <section>
      <h1>{t("recipes.newTitle")}</h1>
      <RecipeForm
        action={createRecipeAction}
        initialValues={{ name: "", portions: "", steps: "", prepTimeMinutes: "", sourceUrl: "", ingredients: [] }}
        products={products}
        submitLabel={t("recipes.create")}
      />
    </section>
  );
}
