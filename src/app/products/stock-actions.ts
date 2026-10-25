"use server";

import { refresh } from "next/cache";
import { parsePositiveQuantity, parseQuantityOnHand, type ParsedQuantity, type QuantityError } from "@/core/stock";
import { getDb } from "@/db";
import { correctProductStock, discardProductStock, restockProduct } from "@/db/stock-movements";

// `value` refills the field after a rejected submit, which React resets.
export type StockFormState = { error: QuantityError | null; value: string };

async function applyFromForm(
  formData: FormData,
  parse: (text: string) => ParsedQuantity,
  apply: (quantity: number) => Promise<void>,
): Promise<StockFormState> {
  const value = String(formData.get("quantity") ?? "");
  const parsed = parse(value);
  if (!parsed.ok) return { error: parsed.error, value };
  await apply(parsed.quantity);
  refresh();
  return { error: null, value: "" };
}

export async function restockAction(
  productId: string,
  _state: StockFormState,
  formData: FormData,
): Promise<StockFormState> {
  return applyFromForm(formData, parsePositiveQuantity, (quantity) => restockProduct(getDb(), productId, quantity));
}

export async function discardAction(
  productId: string,
  _state: StockFormState,
  formData: FormData,
): Promise<StockFormState> {
  return applyFromForm(formData, parsePositiveQuantity, (quantity) => discardProductStock(getDb(), productId, quantity));
}

export async function correctAction(
  productId: string,
  _state: StockFormState,
  formData: FormData,
): Promise<StockFormState> {
  return applyFromForm(formData, parseQuantityOnHand, (quantity) =>
    correctProductStock(getDb(), productId, quantity),
  );
}
