import "server-only";
import { eq, sql } from "drizzle-orm";
import { sortByName } from "@/core/names";
import type { PackSize } from "@/core/products";
import { planGenerate, shortfallsBetween, type ShoppingListSource } from "@/core/shopping-list";
import type { DefaultUnit } from "@/core/units";
import type { Db } from "./index";
import { toPackSize } from "./products";
import { loadStockProjection } from "./projected-stock";
import { products, shoppingListItems } from "./schema";

export interface ShoppingListItem {
  id: string;
  // In the Product's Default Unit; null for an item added by hand without one.
  quantity: number | null;
  source: ShoppingListSource;
  // Bought. Never changes Stock.
  ticked: boolean;
  product: { id: string; name: string; defaultUnit: DefaultUnit; packSize: PackSize | null };
}

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
      .select({
        id: shoppingListItems.id,
        productId: shoppingListItems.productId,
        quantity: shoppingListItems.quantity,
        ticked: shoppingListItems.ticked,
      })
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

// Takes an item off the list. Stock doesn't change, and Generate adds it back
// if its Product is still short. Gone already is fine: it is off the list.
export async function removeShoppingListItem(db: Db, id: string): Promise<void> {
  await db.delete(shoppingListItems).where(eq(shoppingListItems.id, id));
}
