import "server-only";
import { and, desc, eq } from "drizzle-orm";
import {
  correct,
  deduct,
  restock,
  type StockChange,
  type StockMovementType,
  type StockState,
} from "@/core/stock";
import type { Db } from "./index";
import type { MealType } from "./meal-types";
import { meals, mealTypes, products, stockMovements } from "./schema";

export interface StockMovement {
  id: string;
  createdAt: Date;
  type: StockMovementType;
  delta: number;
  resultingQuantity: number;
  // The Meal a Confirmation or Reopen came from; null for other movements,
  // and once that Meal is removed.
  mealId: string | null;
  // What a Stock history row shows of a Confirmation's Meal; null for other
  // movements, and once that Meal is removed.
  meal: StockMovementMeal | null;
}

interface StockMovementMeal {
  date: string;
  name: string | null;
  mealType: Pick<MealType, "seedKey" | "name">;
}

// Writes a Stock Movement and the Stock column it leaves in one transaction,
// never one without the other (ADR 0003). Inside a caller's transaction it
// is part of that one.
export async function applyMovement(
  db: Db,
  productId: string,
  type: StockMovementType,
  change: (current: StockState) => StockChange,
  mealId: string | null = null,
): Promise<void> {
  await db.transaction(async (tx) => {
    // Locked so a concurrent movement cannot apply to the same starting Stock.
    const [current] = await tx
      .select({ stock: products.stock, stockSuspect: products.stockSuspect })
      .from(products)
      .where(eq(products.id, productId))
      .for("update");
    if (!current) throw new Error("Product not found");
    const applied = change(current);
    await tx.insert(stockMovements).values({
      productId,
      type,
      delta: applied.delta,
      resultingQuantity: applied.resultingQuantity,
      clamped: applied.clamped,
      mealId,
    });
    await tx
      .update(products)
      .set({ stock: applied.resultingQuantity, stockSuspect: applied.stockSuspect })
      .where(eq(products.id, productId));
  });
}

// Adds food bought to the Product's Stock.
export async function restockProduct(db: Db, productId: string, quantity: number): Promise<void> {
  await applyMovement(db, productId, "restock", (current) => restock(current, quantity));
}

// Removes food thrown away from the Product's Stock, clamping at 0.
export async function discardProductStock(db: Db, productId: string, quantity: number): Promise<void> {
  await applyMovement(db, productId, "discard", (current) => deduct(current, quantity));
}

// Sets the Product's Stock to the quantity actually on hand.
export async function correctProductStock(db: Db, productId: string, quantity: number): Promise<void> {
  await applyMovement(db, productId, "correction", (current) => correct(current, quantity));
}

// The Product's Stock Movement history, newest first, or only its newest
// `limit` rows. Rows that share a time are ordered by id, so each limit starts
// with the rows of any smaller one.
export async function listStockMovements(db: Db, productId: string, limit?: number): Promise<StockMovement[]> {
  const query = db
    .select({
      id: stockMovements.id,
      createdAt: stockMovements.createdAt,
      type: stockMovements.type,
      delta: stockMovements.delta,
      resultingQuantity: stockMovements.resultingQuantity,
      mealId: stockMovements.mealId,
      meal: { date: meals.date, name: meals.name },
      mealType: { seedKey: mealTypes.seedKey, name: mealTypes.name },
    })
    .from(stockMovements)
    .leftJoin(meals, and(eq(stockMovements.mealId, meals.id), eq(stockMovements.type, "confirmation")))
    .leftJoin(mealTypes, eq(meals.mealTypeId, mealTypes.id))
    .where(eq(stockMovements.productId, productId))
    .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
    .$dynamic();
  const rows = await (limit === undefined ? query : query.limit(limit));
  return rows.map(({ meal, mealType, ...movement }) => ({
    ...movement,
    meal: meal && mealType && { ...meal, mealType },
  }));
}
