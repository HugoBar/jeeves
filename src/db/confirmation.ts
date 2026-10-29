import "server-only";
import { asc, eq } from "drizzle-orm";
import { confirmationDeductions, confirmationsToReverse, staysSuspectAfterReopen } from "@/core/confirmation";
import { canConfirm } from "@/core/meals";
import { deduct, reverse } from "@/core/stock";
import type { ConversionError, DefaultUnit, Unit } from "@/core/units";
import type { Db } from "./index";
import { loadMealSlots } from "./projected-stock";
import { meals, stockMovements } from "./schema";
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
    if (!meal || !canConfirm(meal, today)) return { ok: false, error: "notConfirmable" };

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

// Reopens a Confirmed Meal: one Reopen movement, linked to it, for each
// Confirmation movement not yet reversed, adding back exactly what that one
// removed (data-model Q12). A Product's "stock was probably wrong" flag
// clears only if that Confirmation was what set it. The Meal returns to
// Planned, so Unconfirmed if its day has passed, and keeps its Untracked
// mark. False if it is gone or not Confirmed.
export async function reopenMeal(db: Db, id: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    // Locked so it cannot be Reopened twice at once.
    const [meal] = await tx.select({ status: meals.status }).from(meals).where(eq(meals.id, id)).for("update");
    if (meal?.status !== "confirmed") return false;

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
