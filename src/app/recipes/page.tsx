import Link from "next/link";
import { connection } from "next/server";
import { sortByName } from "@/core/names";
import { getDb } from "@/db";
import { listActiveRecipes } from "@/db/recipes";
import { t } from "@/strings";
import { LinkRow } from "../list-row";

// The Recipes list.
export default async function RecipesPage() {
  // Read from the database on every request, never at build time.
  await connection();
  const recipes = sortByName(await listActiveRecipes(getDb()));

  return (
    <section>
      <h1>{t("recipes.title")}</h1>
      <p>
        <Link href="/recipes/new" className="button button-primary">
          {t("recipes.add")}
        </Link>
      </p>
      {recipes.length === 0 ? (
        <p>{t("recipes.empty")}</p>
      ) : (
        <ul className="list">
          {recipes.map((recipe) => (
            <li key={recipe.id}>
              <LinkRow href={`/recipes/${recipe.id}`}>
                <span className="list-row-text">
                  <span className="list-row-title">{recipe.name}</span>
                </span>
                <span className="list-row-meta">{t("recipes.portionsCount", { portions: recipe.portions })}</span>
              </LinkRow>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
