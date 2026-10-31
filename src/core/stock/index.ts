import { AMOUNT_COLUMN, parseAboveZero, parseNonNegative, parsePositive, roundForColumn } from "@/core/amounts";

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
// leaves, plus the flag afterwards and whether it clamped at 0, which Reopen
// reads back to tell why the flag is on.
export interface StockChange {
  delta: number;
  resultingQuantity: number;
  stockSuspect: boolean;
  clamped: boolean;
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
  return { ...towards(current, clamped ? 0 : unclamped, clamped || current.stockSuspect), clamped };
}

// Stock was counted: it becomes the quantity actually on hand. The only
// movement that clears the flag.
export function correct(current: StockState, quantity: number): StockChange {
  return towards(current, quantity, false);
}

// A Reopen: the opposite of a Confirmation movement, adding back exactly
// the `delta` it recorded, which is what it removed after clamping. The flag
// stays on only if `staysSuspect`: something other than that Confirmation
// set it (core's staysSuspectAfterReopen).
export function reverse(current: StockState, delta: number, staysSuspect: boolean): StockChange {
  return towards(current, roundForColumn(current.stock - delta, AMOUNT_COLUMN), current.stockSuspect && staysSuspect);
}

// The change that takes Stock to `resultingQuantity`, without clamping.
// Subtracting (rather than negating) keeps a zero delta from being -0.
function towards(current: StockState, resultingQuantity: number, stockSuspect: boolean): StockChange {
  return {
    delta: roundForColumn(resultingQuantity - current.stock, AMOUNT_COLUMN),
    resultingQuantity,
    stockSuspect,
    clamped: false,
  };
}

// A quantity typed into the Stock action sheet, in the Product's Default Unit. Each
// error names the rule the text broke.
export type QuantityError = "notAboveZero" | "notZeroOrMore";

export type ParsedQuantity = { ok: true; quantity: number } | { ok: false; error: QuantityError };

function toParsed(quantity: number | null, error: QuantityError): ParsedQuantity {
  return quantity === null ? { ok: false, error } : { ok: true, quantity };
}

// The quantity bought: above 0.
export function parsePositiveQuantity(text: string): ParsedQuantity {
  return toParsed(parsePositive(text.trim(), AMOUNT_COLUMN), "notAboveZero");
}

// The quantity discarded: above 0, with no upper limit. It is never stored,
// as Stock stops at 0 and the movement records what actually left.
export function parseDiscardQuantity(text: string): ParsedQuantity {
  return toParsed(parseAboveZero(text.trim(), AMOUNT_COLUMN), "notAboveZero");
}

// The quantity counted for a Correction: 0 or more.
export function parseQuantityOnHand(text: string): ParsedQuantity {
  return toParsed(parseNonNegative(text.trim(), AMOUNT_COLUMN), "notZeroOrMore");
}

// The Stock Movements someone records by hand on a Product.
export const STOCK_ACTIONS = ["restock", "discard", "correction"] as const satisfies readonly StockMovementType[];

export type StockAction = (typeof STOCK_ACTIONS)[number];

// How each Stock action reads its amount, and what that amount does to Stock.
const STOCK_ACTION_RULES: Record<
  StockAction,
  { parse: (text: string) => ParsedQuantity; change: (current: StockState, quantity: number) => StockChange }
> = {
  restock: { parse: parsePositiveQuantity, change: restock },
  discard: { parse: parseDiscardQuantity, change: deduct },
  correction: { parse: parseQuantityOnHand, change: correct },
};

export function parseStockAmount(action: StockAction, text: string): ParsedQuantity {
  return STOCK_ACTION_RULES[action].parse(text);
}

// What a Stock action will do with the amount typed so far; null until that
// amount is valid.
export function previewStockAction(action: StockAction, current: StockState, text: string): StockChange | null {
  const parsed = parseStockAmount(action, text);
  return parsed.ok ? STOCK_ACTION_RULES[action].change(current, parsed.quantity) : null;
}
