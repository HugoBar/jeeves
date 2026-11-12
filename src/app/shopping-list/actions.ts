"use server";

import { refresh } from "next/cache";
import { isDate } from "@/core/planner";
import { isGenerateRange, parseItemAmount, type DateRange, type ItemAmountError } from "@/core/shopping-list";
import { parseStockAmount, type QuantityError } from "@/core/stock";
import { getDb } from "@/db";
import {
  addProductByHand,
  generateShoppingList,
  removeShoppingListItem,
  restockTickedItems,
  setAllShoppingListItemsTicked,
  setShoppingListItemQuantity,
  setShoppingListItemTicked,
  shoppingListItemPackAmount,
} from "@/db/shopping-list";

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

// Ticks an item as bought, or unticks it; Stock doesn't change.
export async function setShoppingListItemTickedAction(id: string, ticked: boolean): Promise<void> {
  await setShoppingListItemTicked(getDb(), id, ticked);
  refresh();
}

// Sets an unticked item's amount, typed as whole packs with a Pack Size or
// in its Product's Default Unit without one, as the stepper sends it too.
// Returns why the amount was refused, or null; an item ticked or gone
// meanwhile is left as it is.
export async function setShoppingListItemAmountAction(id: string, typed: string): Promise<ItemAmountError | null> {
  const db = getDb();
  const item = await shoppingListItemPackAmount(db, id);
  if (!item) {
    refresh();
    return null;
  }
  const parsed = parseItemAmount(typed, item.packAmount);
  if (!parsed.ok) return parsed.error;
  await setShoppingListItemQuantity(db, id, parsed.quantity);
  refresh();
  return null;
}

// Ticks every item, or unticks every item; Stock doesn't change.
export async function setAllShoppingListItemsTickedAction(ticked: boolean): Promise<void> {
  await setAllShoppingListItemsTicked(getDb(), ticked);
  refresh();
}

// The amount bought of each ticked item, as typed, in its Product's Default
// Unit.
export interface BoughtAmount {
  id: string;
  amount: string;
}

// Restocks each ticked item by the amount bought and takes them off the list.
// Each amount is read as Restock on the Product page reads it; if any is
// rejected nothing changes, and why is returned by item id.
export async function restockTickedItemsAction(
  bought: BoughtAmount[],
): Promise<Record<string, QuantityError> | null> {
  const errors: Record<string, QuantityError> = {};
  const quantities: { id: string; quantity: number }[] = [];
  for (const { id, amount } of bought) {
    const parsed = parseStockAmount("restock", amount);
    if (parsed.ok) quantities.push({ id, quantity: parsed.quantity });
    else errors[id] = parsed.error;
  }
  if (Object.keys(errors).length > 0) return errors;
  await restockTickedItems(getDb(), quantities);
  refresh();
  return null;
}
