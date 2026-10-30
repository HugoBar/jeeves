import { connection } from "next/server";
import { sortMealTypes } from "@/core/meal-types";
import { getDb } from "@/db";
import { listActiveMealTypes } from "@/db/meal-types";
import { mealTypeLabel, t } from "@/strings";
import { CreateMealTypeForm, MealTypeRow } from "./meal-type-forms";

export default async function MealTypesPage() {
  // Read from the database on every request, never at build time.
  await connection();
  const mealTypes = sortMealTypes(await listActiveMealTypes(getDb()), mealTypeLabel);

  return (
    <section>
      <h1>{t("mealTypes.title")}</h1>
      <CreateMealTypeForm />
      <ul className="list">
        {mealTypes.map((mealType) => (
          <li key={mealType.id}>
            <MealTypeRow
              id={mealType.id}
              label={mealTypeLabel(mealType)}
              priority={mealType.priority}
              allowsLeftovers={mealType.allowsLeftovers}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
