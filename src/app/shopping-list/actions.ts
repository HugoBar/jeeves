"use server";

import { refresh } from "next/cache";
import { isDate, plannerWeeks } from "@/core/planner";
import { getDb } from "@/db";
import { addProductByHand, generateShoppingList, removeShoppingListItem } from "@/db/shopping-list";

// Generate from the Shortfalls of the Planner's current week. `today` is the
// viewer's date, which decides that week (spec "Platform").
export async function generateShoppingListAction(today: string): Promise<void> {
  if (!isDate(today)) throw new Error("Not a date");
  const { thisWeek } = plannerWeeks(today);
  await generateShoppingList(getDb(), thisWeek[0]!, thisWeek.at(-1)!);
  refresh();
}

// Takes an item off the list; Stock doesn't change.
export async function removeShoppingListItemAction(id: string): Promise<void> {
  await removeShoppingListItem(getDb(), id);
  refresh();
}

// Adds one pack of a Product by hand. Returns the item added or changed, or
// null when the Product was Archived meanwhile, so nothing was added.
export async function addProductByHandAction(productId: string): Promise<string | null> {
  const result = await addProductByHand(getDb(), productId);
  refresh();
  return result.ok ? result.itemId : null;
}
