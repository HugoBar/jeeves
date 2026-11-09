import { connection } from "next/server";
import { getDb } from "@/db";
import { listShoppingList } from "@/db/shopping-list";
import { ShoppingList } from "./shopping-list";

export default async function ShoppingListPage() {
  // Read from the database on every request, never at build time.
  await connection();
  return <ShoppingList items={await listShoppingList(getDb())} />;
}
