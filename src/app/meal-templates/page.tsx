import { connection } from "next/server";
import { sortCategories } from "@/core/food-categories";
import { sortMealTemplates } from "@/core/meal-templates";
import { sortMealTypes } from "@/core/meal-types";
import { getDb } from "@/db";
import { listMealTemplates, listPickableMealTypes, listPickableSlotCategories } from "@/db/meal-templates";
import { foodCategoryLabel, mealTypeLabel, t } from "@/strings";
import {
  CreateMealTemplateForm,
  MealTemplateRow,
  type MealTypeOption,
  type SlotCategoryOption,
} from "./meal-template-forms";

export default async function MealTemplatesPage() {
  // Read from the database on every request, never at build time.
  await connection();
  const db = getDb();
  const templates = await listMealTemplates(db);
  const templateIds = templates.map((template) => template.id);
  // Archived Meal Types and Slot Categories still in use are listed too, so
  // their templates show them; each picker offers an Archived one only if it
  // already holds it.
  const [mealTypes, slotCategories] = await Promise.all([
    listPickableMealTypes(db, templateIds),
    listPickableSlotCategories(db, templateIds),
  ]);
  const mealTypeOptions: MealTypeOption[] = sortMealTypes(mealTypes, mealTypeLabel).map((mealType) => ({
    id: mealType.id,
    label: mealTypeLabel(mealType),
    archived: mealType.archived,
  }));
  const slotCategoryOptions: SlotCategoryOption[] = sortCategories(slotCategories, foodCategoryLabel).map(
    (category) => ({
      id: category.id,
      label: foodCategoryLabel(category),
      kind: category.kind,
      archived: category.archived,
    }),
  );

  return (
    <section>
      <h1>{t("mealTemplates.title")}</h1>
      <CreateMealTemplateForm mealTypes={mealTypeOptions} slotCategories={slotCategoryOptions} />
      {templates.length === 0 ? (
        <p>{t("mealTemplates.empty")}</p>
      ) : (
        <ul className="item-list">
          {sortMealTemplates(templates).map((template) => (
            <li key={template.id}>
              <MealTemplateRow {...template} mealTypes={mealTypeOptions} slotCategories={slotCategoryOptions} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
