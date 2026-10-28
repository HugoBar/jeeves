import { connection } from "next/server";
import { sortMealTypes } from "@/core/meal-types";
import { plannerRange } from "@/core/planner";
import { getDb } from "@/db";
import { listActiveMealTypes } from "@/db/meal-types";
import { listMeals } from "@/db/meals";
import { mealTypeLabel, t } from "@/strings";
import { Planner, type PlannerMeal } from "./planner";

export default async function PlannerPage() {
  // Read from the database on every request, never at build time.
  await connection();
  const db = getDb();
  // Which two weeks show depends on the viewer's date, known only in the
  // browser, so this loads every Meal any viewer's two weeks could hold.
  const { from, to } = plannerRange(new Date().toISOString().slice(0, 10));
  const [meals, mealTypes] = await Promise.all([listMeals(db, from, to), listActiveMealTypes(db)]);
  const plannerMeals: PlannerMeal[] = meals.map((meal) => ({
    id: meal.id,
    date: meal.date,
    hour: meal.hour,
    createdAt: meal.createdAt,
    name: meal.name,
    mealTypeLabel: mealTypeLabel(meal.mealType),
    mealTypeArchived: meal.mealType.archived,
    untracked: meal.untracked,
  }));
  // The picker offers only Meal Types that are not Archived.
  const mealTypeOptions = sortMealTypes(mealTypes, mealTypeLabel).map((mealType) => ({
    id: mealType.id,
    label: mealTypeLabel(mealType),
  }));

  return (
    <section>
      <h1>{t("planner.title")}</h1>
      <Planner meals={plannerMeals} mealTypes={mealTypeOptions} />
    </section>
  );
}
