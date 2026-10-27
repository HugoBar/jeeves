import { connection } from "next/server";
import { sortMealTemplates } from "@/core/meal-templates";
import { sortMealTypes } from "@/core/meal-types";
import { getDb } from "@/db";
import { listMealTemplates } from "@/db/meal-templates";
import { listMealTypes } from "@/db/meal-types";
import { mealTypeLabel, t } from "@/strings";
import { CreateMealTemplateForm, MealTemplateRow, type MealTypeOption } from "./meal-template-forms";

export default async function MealTemplatesPage() {
  // Read from the database on every request, never at build time.
  await connection();
  const db = getDb();
  const [templates, mealTypes] = await Promise.all([listMealTemplates(db), listMealTypes(db)]);
  const mealTypeOptions: MealTypeOption[] = sortMealTypes(mealTypes, mealTypeLabel).map((mealType) => ({
    id: mealType.id,
    label: mealTypeLabel(mealType),
  }));

  return (
    <section>
      <h1>{t("mealTemplates.title")}</h1>
      <CreateMealTemplateForm mealTypes={mealTypeOptions} />
      {templates.length === 0 ? (
        <p>{t("mealTemplates.empty")}</p>
      ) : (
        <ul className="item-list">
          {sortMealTemplates(templates).map((template) => (
            <li key={template.id}>
              <MealTemplateRow {...template} mealTypes={mealTypeOptions} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
