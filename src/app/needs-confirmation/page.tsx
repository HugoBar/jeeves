import { connection } from "next/server";
import { unconfirmedBefore } from "@/core/planner";
import { getDb } from "@/db";
import { listPlannedMealsBefore } from "@/db/meals";
import { loadPickers, toPlannerMeals } from "../planner/planner-data";
import { NeedsConfirmation } from "./needs-confirmation";

export default async function NeedsConfirmationPage() {
  // Read from the database on every request, never at build time.
  await connection();
  const db = getDb();
  // Which Meals are Unconfirmed depends on the viewer's date, known only in
  // the browser, so this loads every Meal any viewer could see as Unconfirmed.
  const utcToday = new Date().toISOString().slice(0, 10);
  const [meals, pickers] = await Promise.all([listPlannedMealsBefore(db, unconfirmedBefore(utcToday)), loadPickers(db)]);
  const plannerMeals = await toPlannerMeals(db, meals, utcToday);

  return <NeedsConfirmation meals={plannerMeals} {...pickers} />;
}
