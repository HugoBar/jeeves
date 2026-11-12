import { connection } from "next/server";
import { plannerRange } from "@/core/planner";
import { getDb } from "@/db";
import { listMeals } from "@/db/meals";
import { DueRepeats } from "../due-repeats";
import { loadSuggestionContext } from "@/db/suggestions";
import { Planner } from "./planner";
import { loadPickers, toPlannerMeals } from "./planner-data";

export default async function PlannerPage() {
  // Read from the database on every request, never at build time.
  await connection();
  const db = getDb();
  // Which two weeks show depends on the viewer's date, known only in the
  // browser, so this loads every Meal any viewer's two weeks could hold.
  const { from, to } = plannerRange(new Date().toISOString().slice(0, 10));
  const [meals, pickers, suggestions] = await Promise.all([
    listMeals(db, from, to),
    loadPickers(db),
    // Worked out in the browser, which knows how many days away each Meal is.
    loadSuggestionContext(db, from, to),
  ]);
  // Every Meal before the last day shown takes Stock from the ones shown.
  const plannerMeals = await toPlannerMeals(db, meals, to);

  return (
    <section className="page-wide planner">
      <DueRepeats />
      <Planner meals={plannerMeals} suggestions={suggestions} {...pickers} />
    </section>
  );
}
