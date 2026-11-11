import { connection } from "next/server";
import { sortByName } from "@/core/names";
import { getDb } from "@/db";
import { listActiveProducts } from "@/db/products";
import { listShoppingList } from "@/db/shopping-list";
import { ShoppingList } from "./shopping-list";

export default async function ShoppingListPage() {
  // Read from the database on every request, never at build time.
  await connection();
  const db = getDb();
  const [items, products] = await Promise.all([listShoppingList(db), listActiveProducts(db)]);
  // Only what the add field shows: Archived Products never do.
  const addable = sortByName(products).map(({ id, name, defaultUnit, packSize }) => ({ id, name, defaultUnit, packSize }));
  return <ShoppingList items={items} products={addable} />;
}
