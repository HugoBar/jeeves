"use server";

import { refresh } from "next/cache";
import { requireText, requireUuid } from "@/core/request";
import { parseStockAmount, type QuantityError, type StockAction } from "@/core/stock";
import { getDb } from "@/db";
import { getProduct } from "@/db/products";
import { correctProductStock, discardProductStock, restockProduct } from "@/db/stock-movements";

// A Product deleted meanwhile changes nothing; the refresh shows it gone.
async function applyAmount(
  action: StockAction,
  productId: string,
  amount: string,
  apply: (quantity: number) => Promise<QuantityError | null | void>,
): Promise<QuantityError | null> {
  requireUuid(productId);
  const parsed = parseStockAmount(action, requireText(amount));
  if (!parsed.ok) return parsed.error;
  if (!(await getProduct(getDb(), productId))) {
    refresh();
    return null;
  }
  const refused = await apply(parsed.quantity);
  if (refused) return refused;
  refresh();
  return null;
}

export async function restockAction(productId: string, amount: string): Promise<QuantityError | null> {
  return applyAmount("restock", productId, amount, (quantity) => restockProduct(getDb(), productId, quantity));
}

export async function discardAction(productId: string, amount: string): Promise<QuantityError | null> {
  return applyAmount("discard", productId, amount, (quantity) => discardProductStock(getDb(), productId, quantity));
}

export async function correctAction(productId: string, amount: string): Promise<QuantityError | null> {
  return applyAmount("correction", productId, amount, (quantity) => correctProductStock(getDb(), productId, quantity));
}
