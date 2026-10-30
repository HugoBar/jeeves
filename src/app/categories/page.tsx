import { connection } from "next/server";
import { sortCategories } from "@/core/food-categories";
import { getDb } from "@/db";
import { listActiveCategories } from "@/db/food-categories";
import { foodCategoryLabel, t } from "@/strings";
import { CategoryRow, CreateCategoryForm } from "./category-forms";
import { groupCategoriesByKind } from "./category-groups";

export default async function CategoriesPage() {
  // Read from the database on every request, never at build time.
  await connection();
  const categories = sortCategories(await listActiveCategories(getDb()), foodCategoryLabel);

  return (
    <section>
      <h1>{t("categories.title")}</h1>
      <CreateCategoryForm />
      {groupCategoriesByKind(categories).map((group) => (
        <section key={group.kind}>
          <h2>{group.heading}</h2>
          <ul className="list">
            {group.categories.map((category) => (
              <li key={category.id}>
                <CategoryRow id={category.id} label={foodCategoryLabel(category)} kind={category.kind} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
