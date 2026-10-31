"use server";

import { refresh } from "next/cache";
import { parseStockAmount, type QuantityError, type StockAction } from "@/core/stock";
import { getDb } from "@/db";
import { correctProductStock, discardProductStock, restockProduct } from "@/db/stock-movements";

async function applyAmount(
  action: StockAction,
  amount: string,
  apply: (quantity: number) => Promise<void>,
): Promise<QuantityError | null> {
  const parsed = parseStockAmount(action, amount);
  if (!parsed.ok) return parsed.error;
  await apply(parsed.quantity);
  refresh();
  return null;
}

export async function restockAction(productId: string, amount: string): Promise<QuantityError | null> {
  return applyAmount("restock", amount, (quantity) => restockProduct(getDb(), productId, quantity));
}

export async function discardAction(productId: string, amount: string): Promise<QuantityError | null> {
  return applyAmount("discard", amount, (quantity) => discardProductStock(getDb(), productId, quantity));
}

export async function correctAction(productId: string, amount: string): Promise<QuantityError | null> {
  return applyAmount("correction", amount, (quantity) => correctProductStock(getDb(), productId, quantity));
}
