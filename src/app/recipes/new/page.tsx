import { getDb } from "@/db";
import { listPickableProducts } from "@/db/recipes";
import { t } from "@/strings";
import { loadCategoryOptions } from "../../categories/category-options";
import { createRecipeAction } from "../actions";
import { RecipeForm } from "../recipe-form";

export default async function NewRecipePage() {
  const [products, categories] = await Promise.all([
    listPickableProducts(getDb()),
    loadCategoryOptions(getDb()),
  ]);

  return (
    <section>
      <h1>{t("recipes.newTitle")}</h1>
      <RecipeForm
        action={createRecipeAction}
        initialValues={{
          name: "",
          portions: "",
          steps: "",
          prepTimeMinutes: "",
          sourceUrl: "",
          ingredients: [],
          categoryOverrides: [],
        }}
        products={products}
        categories={categories}
        submitLabel={t("recipes.create")}
      />
    </section>
  );
}
