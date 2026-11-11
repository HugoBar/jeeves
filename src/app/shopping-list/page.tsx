import { connection } from "next/server";
import { sortByName } from "@/core/names";
import { plannerRange, unconfirmedBefore } from "@/core/planner";
import { datedShortfalls } from "@/core/shopping-list";
import { getDb } from "@/db";
import { listActiveProducts } from "@/db/products";
import { loadStockProjection } from "@/db/projected-stock";
import { listShoppingList, listUncertainCandidates } from "@/db/shopping-list";
import { ShoppingList } from "./shopping-list";

export default async function ShoppingListPage() {
  // Read from the database on every request, never at build time.
  await connection();
  const db = getDb();
  // Which Meals are Unconfirmed, and which two weeks the Planner covers,
  // depend on the viewer's date, known only in the browser, so this loads
  // every Meal any viewer could see as Unconfirmed, and the Shortfalls of
  // every day any viewer's two weeks could hold.
  const utcToday = new Date().toISOString().slice(0, 10);
  const [items, products, candidates, projection] = await Promise.all([
    listShoppingList(db),
    listActiveProducts(db),
    listUncertainCandidates(db, unconfirmedBefore(utcToday)),
    loadStockProjection(db, plannerRange(utcToday).to),
  ]);
  // Only what the add field shows: Archived Products never do.
  const addable = sortByName(products).map(({ id, name, defaultUnit, packSize, stock }) => ({
    id,
    name,
    defaultUnit,
    packSize,
    stock,
  }));
  return (
    <ShoppingList
      items={items}
      products={addable}
      candidates={candidates}
      shortfalls={datedShortfalls(projection.meals, projection.products)}
    />
  );
}
