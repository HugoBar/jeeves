import "server-only";
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { AMOUNT_COLUMN, roundForColumn } from "@/core/amounts";
import { productsInSlotOrder } from "@/core/confirmation";
import { sortByName } from "@/core/names";
import type { PackSize } from "@/core/products";
import {
  planAddByHand,
  planGenerate,
  planUntick,
  planUntickAll,
  shortfallsBetween,
  type ShoppingListSource,
  type UncertainCandidate,
} from "@/core/shopping-list";
import type { DefaultUnit } from "@/core/units";
import type { Db } from "./index";
import { toPackSize } from "./products";
import { loadMealSlots, loadStockProjection } from "./projected-stock";
import { meals, products, shoppingListItems } from "./schema";
import { restockProduct } from "./stock-movements";

export interface ShoppingListItem {
  id: string;
  // In the Product's Default Unit; null for an item added by hand without one.
  quantity: number | null;
  source: ShoppingListSource;
  // Bought. Never changes Stock.
  ticked: boolean;
  product: { id: string; name: string; defaultUnit: DefaultUnit; packSize: PackSize | null };
}

// What the core planners read of each item.
const listedItem = {
  id: shoppingListItems.id,
  productId: shoppingListItems.productId,
  quantity: shoppingListItems.quantity,
  ticked: shoppingListItems.ticked,
  source: shoppingListItems.source,
};

// The one current Shopping List, by Product name.
export async function listShoppingList(db: Db): Promise<ShoppingListItem[]> {
  const rows = await db
    .select({
      id: shoppingListItems.id,
      quantity: shoppingListItems.quantity,
      source: shoppingListItems.source,
      ticked: shoppingListItems.ticked,
      productId: products.id,
      name: products.name,
      defaultUnit: products.defaultUnit,
      packSizeName: products.packSizeName,
      packSizeAmount: products.packSizeAmount,
    })
    .from(shoppingListItems)
    .innerJoin(products, eq(shoppingListItems.productId, products.id));
  return sortByName(rows).map((row) => ({
    id: row.id,
    quantity: row.quantity,
    source: row.source,
    ticked: row.ticked,
    product: {
      id: row.productId,
      name: row.name,
      defaultUnit: row.defaultUnit,
      packSize: toPackSize(row),
    },
  }));
}

// Generate: tops the list up to what the Meals from `from` to `to` are short
// of (spec "Shopping List"), never lowering an item or touching a ticked one.
// The list is locked meanwhile, so two at once can't both add the same
// Product.
export async function generateShoppingList(db: Db, from: string, to: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`lock table ${shoppingListItems} in exclusive mode`);
    const { meals, products } = await loadStockProjection(tx, to);
    const items = await tx
      .select(listedItem)
      .from(shoppingListItems);
    const plan = planGenerate(shortfallsBetween(meals, products, from, to), items);
    if (plan.add.length > 0) {
      await tx.insert(shoppingListItems).values(plan.add.map((item) => ({ ...item, source: "shortfall" as const })));
    }
    for (const { id, quantity } of plan.raise) {
      await tx.update(shoppingListItems).set({ quantity }).where(eq(shoppingListItems.id, id));
    }
  });
}

// Adds one pack of a Product by hand (spec "Shopping List"): to its unticked
// item, or on a new one. `itemId` is the item added or changed, which counts
// as added by hand. A Product Archived or gone meanwhile is unavailable. The
// list is locked meanwhile, like Generate, so the Product never gets two
// unticked items.
export async function addProductByHand(
  db: Db,
  productId: string,
): Promise<{ ok: true; itemId: string } | { ok: false; error: "unavailable" }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`lock table ${shoppingListItems} in exclusive mode`);
    const [product] = await tx
      .select({ packSizeName: products.packSizeName, packSizeAmount: products.packSizeAmount })
      .from(products)
      .where(and(eq(products.id, productId), isNull(products.archivedAt)));
    if (!product) return { ok: false, error: "unavailable" } as const;
    const items = await tx
      .select(listedItem)
      .from(shoppingListItems)
      .where(eq(shoppingListItems.productId, productId));
    const plan = planAddByHand(toPackSize(product)?.amount ?? null, items);
    if (plan.kind !== "add") {
      const quantity = plan.kind === "raise" ? { quantity: plan.quantity } : {};
      await tx
        .update(shoppingListItems)
        .set({ ...quantity, source: "manual" })
        .where(eq(shoppingListItems.id, plan.id));
      return { ok: true, itemId: plan.id } as const;
    }
    const [added] = await tx
      .insert(shoppingListItems)
      .values({ productId, quantity: plan.quantity, source: "manual" })
      .returning({ id: shoppingListItems.id });
    return { ok: true, itemId: added!.id } as const;
  });
}

// Sets an unticked item's amount by hand (spec "Shopping List"), in its
// Product's Default Unit; false, changing nothing, for an item ticked or gone
// meanwhile, as what was bought is entered at Restock. Part of it was then
// chosen, so it counts as added by hand. Removing it is ✕'s job, so an
// amount of 0 or below is a mistake.
export async function setShoppingListItemQuantity(db: Db, id: string, quantity: number): Promise<boolean> {
  if (!(quantity > 0)) throw new Error("A Shopping List amount must be above 0");
  const set = await db
    .update(shoppingListItems)
    .set({ quantity: roundForColumn(quantity, AMOUNT_COLUMN), source: "manual" })
    .where(and(eq(shoppingListItems.id, id), eq(shoppingListItems.ticked, false)))
    .returning({ id: shoppingListItems.id });
  return set.length > 0;
}

// The amount of an item's Pack Size, null without one, which a typed amount
// is read with; null for an item gone.
export async function shoppingListItemPackAmount(db: Db, id: string): Promise<{ packAmount: number | null } | null> {
  const [row] = await db
    .select({ packSizeName: products.packSizeName, packSizeAmount: products.packSizeAmount })
    .from(shoppingListItems)
    .innerJoin(products, eq(shoppingListItems.productId, products.id))
    .where(eq(shoppingListItems.id, id));
  return row ? { packAmount: toPackSize(row)?.amount ?? null } : null;
}

// Takes an item off the list. Stock doesn't change, and Generate adds it back
// if its Product is still short. Gone already is fine: it is off the list.
export async function removeShoppingListItem(db: Db, id: string): Promise<void> {
  await db.delete(shoppingListItems).where(eq(shoppingListItems.id, id));
}

// Ticks an item as bought, or unticks it. Neither changes Stock. Unticked
// beside its Product's unticked item, it adds its amount to that one, which
// counts as added by hand if either was, and goes, as a Product has one
// unticked item at most. The list is locked meanwhile, like Generate. Gone
// already is fine: there is nothing to tick.
export async function setShoppingListItemTicked(db: Db, id: string, ticked: boolean): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`lock table ${shoppingListItems} in exclusive mode`);
    const [item] = await tx
      .select({ productId: shoppingListItems.productId })
      .from(shoppingListItems)
      .where(eq(shoppingListItems.id, id));
    if (!item) return;
    if (ticked) {
      await tx.update(shoppingListItems).set({ ticked }).where(eq(shoppingListItems.id, id));
      return;
    }
    const items = await tx
      .select(listedItem)
      .from(shoppingListItems)
      .where(eq(shoppingListItems.productId, item.productId));
    const plan = planUntick(id, items);
    if (plan.kind === "untick") {
      await tx.update(shoppingListItems).set({ ticked }).where(eq(shoppingListItems.id, id));
      return;
    }
    await tx.delete(shoppingListItems).where(eq(shoppingListItems.id, id));
    await tx
      .update(shoppingListItems)
      .set({ quantity: plan.quantity, source: plan.source })
      .where(eq(shoppingListItems.id, plan.into));
  });
}

// Ticks every item, or unticks every item. Neither changes Stock. Unticked,
// a Product's items are added into one, as unticking one does, added by hand
// if any was. The list is locked meanwhile, like Generate.
export async function setAllShoppingListItemsTicked(db: Db, ticked: boolean): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`lock table ${shoppingListItems} in exclusive mode`);
    if (ticked) {
      await tx.update(shoppingListItems).set({ ticked });
      return;
    }
    const items = await tx
      .select(listedItem)
      .from(shoppingListItems);
    const plan = planUntickAll(items);
    // The items that go first, so no Product has two unticked items meanwhile.
    if (plan.remove.length > 0) await tx.delete(shoppingListItems).where(inArray(shoppingListItems.id, plan.remove));
    for (const { id, quantity, source } of plan.keep) {
      await tx.update(shoppingListItems).set({ ticked, quantity, source }).where(eq(shoppingListItems.id, id));
    }
  });
}

// "Restock ticked items" (spec "Shopping List"): one Restock per item, of the
// amount bought, in its Product's Default Unit, and the item leaves the list;
// all or none. Two items of one Product are two Restocks. An item gone or
// unticked meanwhile is left as it is, so pressing twice restocks once. The
// list is locked meanwhile, like Generate.
export async function restockTickedItems(db: Db, bought: readonly { id: string; quantity: number }[]): Promise<void> {
  if (bought.length === 0) return;
  await db.transaction(async (tx) => {
    await tx.execute(sql`lock table ${shoppingListItems} in exclusive mode`);
    const items = await tx
      .select({ id: shoppingListItems.id, productId: shoppingListItems.productId })
      .from(shoppingListItems)
      .where(and(inArray(shoppingListItems.id, bought.map(({ id }) => id)), eq(shoppingListItems.ticked, true)));
    for (const { id, productId } of items) {
      await restockProduct(tx, productId, bought.find((item) => item.id === id)!.quantity);
    }
    if (items.length > 0) await tx.delete(shoppingListItems).where(inArray(shoppingListItems.id, items.map(({ id }) => id)));
  });
}

// Every Meal that could be Unconfirmed for any viewer, Planned and before
// `before`, with the Products its slots use, for core's stockUncertainty.
export async function listUncertainCandidates(db: Db, before: string): Promise<UncertainCandidate[]> {
  const rows = await db
    .select({ id: meals.id, status: meals.status, date: meals.date, untracked: meals.untracked })
    .from(meals)
    .where(and(eq(meals.status, "planned"), lt(meals.date, before)));
  const { slotsByMeal } = await loadMealSlots(db, rows.map((meal) => meal.id));
  return rows.map(({ id, ...meal }) => ({ ...meal, productIds: productsInSlotOrder(slotsByMeal.get(id)!) }));
}
