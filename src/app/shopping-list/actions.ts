"use server";

import { refresh } from "next/cache";
import { isDate } from "@/core/planner";
import { isGenerateRange, type DateRange } from "@/core/shopping-list";
import { getDb } from "@/db";
import { addProductByHand, generateShoppingList, removeShoppingListItem } from "@/db/shopping-list";

// Generate from the Shortfalls of the Meals in `range`, which lies in the
// Planner's two weeks. `today` is the viewer's date, which decides those
// weeks (spec "Platform").
export async function generateShoppingListAction(today: string, range: DateRange): Promise<void> {
  if (!isDate(today) || !isGenerateRange(today, range)) throw new Error("Not dates Generate can use");
  await generateShoppingList(getDb(), range.from, range.to);
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
