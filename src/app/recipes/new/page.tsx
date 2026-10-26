import { t } from "@/strings";
import { createRecipeAction } from "../actions";
import { RecipeForm } from "../recipe-form";

export default function NewRecipePage() {
  return (
    <section>
      <h1>{t("recipes.newTitle")}</h1>
      <RecipeForm
        action={createRecipeAction}
        initialValues={{ name: "", portions: "", steps: "", prepTimeMinutes: "", sourceUrl: "" }}
        submitLabel={t("recipes.create")}
      />
    </section>
  );
}
