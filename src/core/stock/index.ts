import { AMOUNT_COLUMN, parseNonNegative, parsePositive, roundForColumn } from "@/core/amounts";

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

// Food was bought. The flag stays: adding to a wrong Stock leaves it wrong.
export function restock(current: StockState, quantity: number): StockChange {
  return towards(current, roundForColumn(current.stock + quantity, AMOUNT_COLUMN), current.stockSuspect);
}

// Food left Stock: a Discard, and later a Confirmation. Stock never goes
// below 0; a deduction past 0 clamps there and flags the Stock as probably
// wrong. The delta is what was actually removed.
export function deduct(current: StockState, quantity: number): StockChange {
  const unclamped = roundForColumn(current.stock - quantity, AMOUNT_COLUMN);
  const clamped = unclamped < 0;
  return towards(current, clamped ? 0 : unclamped, clamped || current.stockSuspect);
}

// Stock was counted: it becomes the quantity actually on hand. The only
// movement that clears the flag.
export function correct(current: StockState, quantity: number): StockChange {
  return towards(current, quantity, false);
}

// The change that takes Stock to `resultingQuantity`. Subtracting (rather
// than negating) keeps a zero delta from being -0.
function towards(current: StockState, resultingQuantity: number, stockSuspect: boolean): StockChange {
  return {
    delta: roundForColumn(resultingQuantity - current.stock, AMOUNT_COLUMN),
    resultingQuantity,
    stockSuspect,
  };
}

// A quantity typed into a Stock form, in the Product's Default Unit. Each
// error names the rule the text broke.
export type QuantityError = "notAboveZero" | "notZeroOrMore";

export type ParsedQuantity = { ok: true; quantity: number } | { ok: false; error: QuantityError };

function toParsed(quantity: number | null, error: QuantityError): ParsedQuantity {
  return quantity === null ? { ok: false, error } : { ok: true, quantity };
}

// The quantity bought or discarded: above 0.
export function parsePositiveQuantity(text: string): ParsedQuantity {
  return toParsed(parsePositive(text.trim(), AMOUNT_COLUMN), "notAboveZero");
}

// The quantity counted for a Correction: 0 or more.
export function parseQuantityOnHand(text: string): ParsedQuantity {
  return toParsed(parseNonNegative(text.trim(), AMOUNT_COLUMN), "notZeroOrMore");
}
