import { AMOUNT_COLUMN, parsePositive, roundForColumn } from "@/core/amounts";

// What caused a Stock Movement (glossary: Stock Movement).
export const STOCK_MOVEMENT_TYPES = ["restock", "discard", "correction", "confirmation", "reopen"] as const;

export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

// A Product's current Stock and its "stock was probably wrong" flag, which
// change only together with a Stock Movement (ADR 0003).
export interface StockState {
  stock: number;
  stockSuspect: boolean;
}

// What a Stock Movement does to Stock: the change applied and the Stock it
// leaves, plus the flag afterwards.
export interface StockChange {
  delta: number;
  resultingQuantity: number;
  stockSuspect: boolean;
}

// Food was bought.
export function restock(current: StockState, quantity: number): StockChange {
  return {
    delta: quantity,
    resultingQuantity: roundForColumn(current.stock + quantity, AMOUNT_COLUMN),
    stockSuspect: false,
  };
}

// The quantity typed into the Restock form, in the Product's Default Unit.
export type RestockQuantityError = "invalidQuantity";

export function parseRestockQuantity(
  text: string,
): { ok: true; quantity: number } | { ok: false; error: RestockQuantityError } {
  const quantity = parsePositive(text.trim(), AMOUNT_COLUMN);
  return quantity === null ? { ok: false, error: "invalidQuantity" } : { ok: true, quantity };
}
