import "server-only";
import { eq } from "drizzle-orm";
import { sortByName } from "@/core/names";
import type { PackSize } from "@/core/products";
import type { ShoppingListSource } from "@/core/shopping-list";
import type { DefaultUnit } from "@/core/units";
import type { Db } from "./index";
import { toPackSize } from "./products";
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
