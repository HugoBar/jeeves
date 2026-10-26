import Link from "next/link";
import { notFound } from "next/navigation";
import Markdown from "react-markdown";
import { getDb } from "@/db";
import { getRecipe } from "@/db/recipes";
import { t } from "@/strings";
import { isUuid } from "../../uuid";

// A Recipe: its Portions, prep time, source and steps.
export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const recipe = await getRecipe(getDb(), id);
  if (!recipe) notFound();

  return (
    <section>
      <h1>{recipe.name}</h1>
      <p>
        <Link href={`/recipes/${recipe.id}/edit`}>{t("recipes.edit")}</Link>
      </p>
      <p>{t("recipes.portionsCount", { portions: recipe.portions })}</p>
      <p>{t("recipes.prepTimeMinutes", { minutes: recipe.prepTimeMinutes })}</p>
      {recipe.sourceUrl !== null && (
        <p>
          <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer">
            {t("recipes.source")}
          </a>
        </p>
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
