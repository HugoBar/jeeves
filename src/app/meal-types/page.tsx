import { connection } from "next/server";
import { sortMealTypes } from "@/core/meal-types";
import { getDb } from "@/db";
import { listMealTypes } from "@/db/meal-types";
import { mealTypeLabel, t } from "@/strings";
import { MealTypeRow } from "./meal-type-row";

export default async function MealTypesPage() {
  // Read from the database on every request, never at build time.
  await connection();
  const mealTypes = sortMealTypes(await listMealTypes(getDb()), mealTypeLabel);

  return (
    <section>
      <h1>{t("mealTypes.title")}</h1>
      <ul className="item-list">
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
