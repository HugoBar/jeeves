import { connection } from "next/server";
import { sortByName } from "@/core/names";
import { unconfirmedBefore } from "@/core/planner";
import { getDb } from "@/db";
import { listActiveProducts } from "@/db/products";
import { listShoppingList, listUncertainCandidates } from "@/db/shopping-list";
import { ShoppingList } from "./shopping-list";

export default async function ShoppingListPage() {
  // Read from the database on every request, never at build time.
  await connection();
  const db = getDb();
  // Which Meals are Unconfirmed depends on the viewer's date, known only in
  // the browser, so this loads every Meal any viewer could see as Unconfirmed.
  const utcToday = new Date().toISOString().slice(0, 10);
  const [items, products, candidates] = await Promise.all([
    listShoppingList(db),
    listActiveProducts(db),
    listUncertainCandidates(db, unconfirmedBefore(utcToday)),
  ]);
  // Only what the add field shows: Archived Products never do.
  const addable = sortByName(products).map(({ id, name, defaultUnit, packSize }) => ({ id, name, defaultUnit, packSize }));
  return <ShoppingList items={items} products={addable} candidates={candidates} />;
}
