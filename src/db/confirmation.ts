import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import {
  confirmationDeductions,
  confirmationsToReverse,
  productsInSlotOrder,
  staysSuspectAfterReopen,
} from "@/core/confirmation";
import { canReopen, canConfirmOrSkip } from "@/core/meals";
import { deduct, reverse } from "@/core/stock";
import type { ConversionError, DefaultUnit, Unit } from "@/core/units";
import type { Db } from "./index";
import { loadMealSlots } from "./projected-stock";
import { meals, products, stockMovements } from "./schema";
import { applyMovement } from "./stock-movements";

// "notConfirmable": the Meal is gone, already Confirmed or Skipped, or after
// `today`. "unconvertible": an Ingredient, as written in its Recipe, cannot
// be converted to its Product's Default Unit.
export type ConfirmMealResult =
  | { ok: true }
  | { ok: false; error: "notConfirmable" }
  | {
      ok: false;
      error: "unconvertible";
      product: { name: string; defaultUnit: DefaultUnit };
      amount: number;
      unit: Unit;
      code: ConversionError["code"];
    };

// A Meal "Confirm all as planned" could not Confirm, and why.
export interface RefusedMeal {
  mealId: string;
  refusal: Exclude<ConfirmMealResult, { ok: true }>;
}

// Confirms the Meal (spec "Confirmation"): one Confirmation movement per
// Product, linked to it, deducting what its slots used, each clamping at 0
// and flagging the Stock as a Discard does. An Untracked Meal, or one
// Confirmed as Untracked, deducts nothing and stays Untracked. All or
// nothing: an Ingredient that cannot be converted refuses it all. `today` is
// the viewer's date.
export async function confirmMeal(
  db: Db,
  id: string,
  { untracked, today }: { untracked: boolean; today: string },
): Promise<ConfirmMealResult> {
  return db.transaction(async (tx) => {
    // Locked so it cannot be Confirmed twice at once.
    const [meal] = await tx
      .select({ status: meals.status, date: meals.date, untracked: meals.untracked })
      .from(meals)
      .where(eq(meals.id, id))
      .for("update");
    if (!meal || !canConfirmOrSkip(meal, today)) return { ok: false, error: "notConfirmable" };

    const marksUntracked = untracked || meal.untracked;
    if (!marksUntracked) {
      const { slotsByMeal, products } = await loadMealSlots(tx, [id]);
      const result = confirmationDeductions(slotsByMeal.get(id)!, products);
      if (!result.ok) {
        const { productId, amount, unit, error } = result.unconvertible;
        const { name, defaultUnit } = products.get(productId)!;
        return { ok: false, error: "unconvertible", product: { name, defaultUnit }, amount, unit, code: error.code };
      }
      for (const { productId, quantity } of result.deductions) {
        await applyMovement(tx, productId, "confirmation", (current) => deduct(current, quantity), id);
      }
    }
    await tx.update(meals).set({ status: "confirmed", untracked: marksUntracked }).where(eq(meals.id, id));
    return { ok: true };
  });
}

// "Confirm all as planned" (#1): Confirms each Meal in turn, as planned and
// each on its own, so one that is refused leaves the others Confirmed. An
// Untracked Meal stays Untracked and deducts nothing. Returns the refused
// ones, in the order given, each with nothing written.
export async function confirmMealsAsPlanned(
  db: Db,
  ids: readonly string[],
  today: string,
): Promise<RefusedMeal[]> {
  const refused: RefusedMeal[] = [];
  for (const mealId of ids) {
    const result = await confirmMeal(db, mealId, { untracked: false, today });
    if (!result.ok) refused.push({ mealId, refusal: result });
  }
  return refused;
}

// Skips the Meal (spec "Confirmation"): it was not eaten, so it writes no
// Stock Movements and keeps its Untracked mark. `today` is the viewer's date.
// False if the Meal is gone, already Confirmed or Skipped, or after `today`.
export async function skipMeal(db: Db, id: string, today: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    // Locked so it cannot be Confirmed meanwhile.
    const [meal] = await tx
      .select({ status: meals.status, date: meals.date })
      .from(meals)
      .where(eq(meals.id, id))
      .for("update");
    if (!meal || !canConfirmOrSkip(meal, today)) return false;
    await tx.update(meals).set({ status: "skipped" }).where(eq(meals.id, id));
    return true;
  });
}

// What Reopening a Meal adds back to one Product's Stock, in its Default Unit.
export interface AddedBack {
  name: string;
  defaultUnit: DefaultUnit;
  quantity: number;
}

// What Reopening each Meal would add back, in the order of its slots: exactly
// what its Confirmation movements not yet reversed took, as reopenMeal
// reverses them, leaving out a Product they took none of. Empty for a Skipped or Untracked
// Meal, which took nothing. Every Meal given has an entry.
export async function listReopenAddsBack(db: Db, mealIds: readonly string[]): Promise<Map<string, AddedBack[]>> {
  const byMeal = new Map<string, AddedBack[]>(mealIds.map((id) => [id, []]));
  if (mealIds.length === 0) return byMeal;
  const linked = await db
    .select({
      mealId: stockMovements.mealId,
      productId: stockMovements.productId,
      type: stockMovements.type,
      delta: stockMovements.delta,
      name: products.name,
      defaultUnit: products.defaultUnit,
    })
    .from(stockMovements)
    .innerJoin(products, eq(stockMovements.productId, products.id))
    .where(inArray(stockMovements.mealId, [...mealIds]));
  const productOf = new Map(linked.map(({ productId, name, defaultUnit }) => [productId, { name, defaultUnit }]));
  // A Confirmed Meal's slots can't change, so they still say what it took.
  const { slotsByMeal } = await loadMealSlots(db, [...mealIds]);
  for (const mealId of byMeal.keys()) {
    const reversed = confirmationsToReverse(linked.filter((movement) => movement.mealId === mealId));
    // A Product a Recipe no longer holds goes last.
    const order = productsInSlotOrder(slotsByMeal.get(mealId) ?? []);
    const rank = (productId: string) => (order.includes(productId) ? order.indexOf(productId) : order.length);
    // A Confirmation's delta is what it removed, so negative; 0 when the
    // Stock was already empty, which adds nothing back.
    const addsBack = reversed
      .filter(({ delta }) => delta !== 0)
      .toSorted((a, b) => rank(a.productId) - rank(b.productId))
      .map(({ productId, delta }) => ({ ...productOf.get(productId)!, quantity: -delta }));
    byMeal.set(mealId, addsBack);
  }
  return byMeal;
}

// Reopens a Confirmed or Skipped Meal: one Reopen movement, linked to it, for
// each Confirmation movement not yet reversed, adding back exactly what that
// one removed (data-model Q12). A Skipped Meal has none left, so it writes
// nothing. A Product's "stock was probably wrong" flag clears only if that
// Confirmation was what set it. The Meal returns to Planned, so Unconfirmed
// if its day has passed, and keeps its Untracked mark. False if it is gone or
// neither Confirmed nor Skipped.
export async function reopenMeal(db: Db, id: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    // Locked so it cannot be Reopened twice at once.
    const [meal] = await tx.select({ status: meals.status }).from(meals).where(eq(meals.id, id)).for("update");
    if (!meal || !canReopen(meal)) return false;

    const linked = await tx
      .select({ productId: stockMovements.productId, type: stockMovements.type, delta: stockMovements.delta })
      .from(stockMovements)
      .where(eq(stockMovements.mealId, id));
    for (const { productId, delta } of confirmationsToReverse(linked)) {
      const history = await tx
        .select({ type: stockMovements.type, clamped: stockMovements.clamped, mealId: stockMovements.mealId })
        .from(stockMovements)
        .where(eq(stockMovements.productId, productId))
        .orderBy(asc(stockMovements.createdAt));
      const staysSuspect = staysSuspectAfterReopen(history, id);
      await applyMovement(tx, productId, "reopen", (current) => reverse(current, delta, staysSuspect), id);
    }
    await tx.update(meals).set({ status: "planned" }).where(eq(meals.id, id));
    return true;
  });
}
