"use server";

import { refresh } from "next/cache";
import {
  MalformedRequest,
  requireBoolean,
  requireDate,
  requireList,
  requireRecord,
  requireText,
  requireUuid,
} from "@/core/request";
import { isGenerateRange, parseItemAmount, type DateRange, type ItemAmountError } from "@/core/shopping-list";
import { parseStockAmount, type QuantityError } from "@/core/stock";
import { getDb } from "@/db";
import { createDueRepeats } from "@/db/meal-series";
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
// weeks (spec "Platform"). The Meal Series repeats due on it are created
// first, so their Meals count too. Returns the Products that would need
// more than an item holds, when Generate changed nothing; else null.
export async function generateShoppingListAction(today: string, range: DateRange): Promise<string[] | null> {
  requireDate(today);
  const dates = requireRecord(range);
  range = { from: requireDate(dates.from), to: requireDate(dates.to) };
  if (!isGenerateRange(today, range)) throw new MalformedRequest("dates Generate can use");
  const db = getDb();
  await createDueRepeats(db, today);
  const result = await generateShoppingList(db, range.from, range.to);
  refresh();
  return result.ok ? null : result.tooLarge;
}

// Takes an item off the list; Stock doesn't change.
export async function removeShoppingListItemAction(id: string): Promise<void> {
  await removeShoppingListItem(getDb(), requireUuid(id));
  refresh();
}

// Adds one pack of a Product by hand. Returns the item added or changed, or
// null when the Product was Archived meanwhile, or its item can't hold
// another pack, so nothing was added.
export async function addProductByHandAction(productId: string): Promise<string | null> {
  const result = await addProductByHand(getDb(), requireUuid(productId));
  refresh();
  return result.ok ? result.itemId : null;
}

// Ticks an item as bought, or unticks it; Stock doesn't change. False when
// unticking would add its amount to its Product's unticked item past what an
// item holds, so nothing changed.
export async function setShoppingListItemTickedAction(id: string, ticked: boolean): Promise<boolean> {
  const done = await setShoppingListItemTicked(getDb(), requireUuid(id), requireBoolean(ticked));
  refresh();
  return done;
}

// Sets an unticked item's amount, typed as whole packs with a Pack Size or
// in its Product's Default Unit without one, as the stepper sends it too.
// Returns why the amount was refused, or null; an item ticked or gone
// meanwhile is left as it is.
export async function setShoppingListItemAmountAction(id: string, typed: string): Promise<ItemAmountError | null> {
  requireUuid(id);
  requireText(typed);
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

// Ticks every item, or unticks every item; Stock doesn't change. False when
// unticking would add a Product's items up past what an item holds, so
// nothing changed.
export async function setAllShoppingListItemsTickedAction(ticked: boolean): Promise<boolean> {
  const done = await setAllShoppingListItemsTicked(getDb(), requireBoolean(ticked));
  refresh();
  return done;
}

// The amount bought of each ticked item, as typed, in its Product's Default
// Unit.
export interface BoughtAmount {
  id: string;
  amount: string;
}

// Restocks each ticked item by the amount bought and takes them off the list.
// Each amount is read as Restock on the Product page reads it; if any is
// rejected, or would leave more Stock than its Product holds, nothing
// changes, and why is returned by item id.
export async function restockTickedItemsAction(
  bought: BoughtAmount[],
): Promise<Record<string, QuantityError> | null> {
  const sent = requireList(bought, (item) => {
    const { id, amount } = requireRecord(item);
    return { id: requireUuid(id), amount: requireText(amount) };
  });
  const errors: Record<string, QuantityError> = {};
  const quantities: { id: string; quantity: number }[] = [];
  for (const { id, amount } of sent) {
    const parsed = parseStockAmount("restock", amount);
    if (parsed.ok) quantities.push({ id, quantity: parsed.quantity });
    else errors[id] = parsed.error;
  }
  if (Object.keys(errors).length > 0) return errors;
  const refused = await restockTickedItems(getDb(), quantities);
  if (refused) return { [refused]: "stockTooLarge" };
  refresh();
  return null;
}
