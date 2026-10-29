import { AMOUNT_COLUMN, roundForColumn } from "@/core/amounts";
import { slotNeeds, type ProjectedSlot, type UnconvertibleIngredient } from "@/core/projected-stock";
import type { StockMovementType } from "@/core/stock";
import type { ConvertibleProduct } from "@/core/units";

// What Confirming a Meal takes from one Product's Stock, in its Default Unit.
export interface Deduction {
  productId: string;
  quantity: number;
}

// The deductions, one per Product, or the first Ingredient that cannot be
// converted, which refuses the whole Confirmation: nothing is deducted.
export type ConfirmationDeductions =
  | { ok: true; deductions: Deduction[] }
  | { ok: false; unconvertible: UnconvertibleIngredient };

// What Confirming a tracked Meal deducts: what its slots need, as Projected
// Stock works it out (spec "Confirmation"), summed per Product over the slots
// and rounded to 2 decimals as stored (data-model T6, Q2). `products` holds at least every Product the slots
// use, Archived ones too.
export function confirmationDeductions(
  slots: readonly ProjectedSlot[],
  products: ReadonlyMap<string, ConvertibleProduct>,
): ConfirmationDeductions {
  const totals = new Map<string, number>();
  for (const slot of slots) {
    const { needs, unconvertible } = slotNeeds(slot, products);
    if (unconvertible.length > 0) return { ok: false, unconvertible: unconvertible[0]! };
    for (const [productId, need] of needs) totals.set(productId, (totals.get(productId) ?? 0) + need);
  }
  return {
    ok: true,
    deductions: [...totals].map(([productId, total]) => ({ productId, quantity: roundForColumn(total, AMOUNT_COLUMN) })),
  };
}

// A Stock Movement linked to a Meal.
export interface MealMovement {
  productId: string;
  type: StockMovementType;
  delta: number;
}

// The Confirmation movements a Reopen must reverse, each with the delta it
// recorded: what it actually removed, after clamping (data-model Q12). A
// Confirmation writes one movement per Product and a Reopen reverses each, so
// a Product has one left to reverse when it has more Confirmations than
// Reopens, and the reversed pairs cancel out, leaving its delta as the sum.
export function confirmationsToReverse(movements: readonly MealMovement[]): Omit<MealMovement, "type">[] {
  const byProduct = new Map<string, { outstanding: number; delta: number }>();
  for (const { productId, type, delta } of movements) {
    if (type !== "confirmation" && type !== "reopen") continue;
    const product = byProduct.get(productId) ?? { outstanding: 0, delta: 0 };
    product.outstanding += type === "confirmation" ? 1 : -1;
    product.delta = roundForColumn(product.delta + delta, AMOUNT_COLUMN);
    byProduct.set(productId, product);
  }
  return [...byProduct]
    .filter(([, product]) => product.outstanding > 0)
    .map(([productId, { delta }]) => ({ productId, delta }));
}

// A Stock Movement in one Product's history, as Reopen reads it: whether it
// clamped at 0, and the Meal of a Confirmation or Reopen (null once removed).
export interface ProductMovement {
  type: StockMovementType;
  clamped: boolean;
  mealId: string | null;
}

// Whether the "stock was probably wrong" flag stays on after Reopening
// `mealId`. The flag is on exactly while a clamp since the last Correction
// still stands, as only a clamp sets it and only a Correction clears it. A
// Reopened Confirmation's clamp no longer stands: Reopen gives back what it
// removed. So the flag clears only if this Meal's Confirmation was all that
// set it; one set for another reason stays for the user to look into.
// `history` is oldest first.
export function staysSuspectAfterReopen(history: readonly ProductMovement[], mealId: string): boolean {
  const lastCorrection = history.findLastIndex((movement) => movement.type === "correction");
  const since = history.slice(lastCorrection + 1);
  return since.some((movement, index) => {
    if (!movement.clamped) return false;
    if (movement.type !== "confirmation") return true;
    // A removed Meal was Reopened first.
    if (movement.mealId === null || movement.mealId === mealId) return false;
    return !since.slice(index + 1).some((later) => later.type === "reopen" && later.mealId === movement.mealId);
  });
}
