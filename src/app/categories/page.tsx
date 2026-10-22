import { connection } from "next/server";
import { sortCategories, type CategoryKind } from "@/core/food-categories";
import { getDb } from "@/db";
import { listActiveCategories } from "@/db/food-categories";
import { foodCategoryLabel, t, type StringKey } from "@/strings";
import { CategoryRow, CreateCategoryForm } from "./category-forms";

const GROUPS: { kind: CategoryKind; heading: StringKey }[] = [
  { kind: "role", heading: "categories.roles" },
  { kind: "kind", heading: "categories.kinds" },
];

export default async function CategoriesPage() {
  // Read from the database on every request, never at build time.
  await connection();
  const categories = sortCategories(await listActiveCategories(getDb()), foodCategoryLabel);

  return (
    <section>
      <h1>{t("categories.title")}</h1>
      <CreateCategoryForm />
      {GROUPS.map(({ kind, heading }) => (
        <section key={kind}>
          <h2>{t(heading)}</h2>
          <ul className="category-list">
            {categories
              .filter((category) => category.kind === kind)
              .map((category) => (
                <li key={category.id}>
                  <CategoryRow
                    id={category.id}
                    label={foodCategoryLabel(category)}
                    kind={category.kind}
                  />
                </li>
              ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
