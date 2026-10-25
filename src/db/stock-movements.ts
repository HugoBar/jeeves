import "server-only";
import { desc, eq } from "drizzle-orm";
import {
  correct,
  deduct,
  restock,
  type StockChange,
  type StockMovementType,
  type StockState,
} from "@/core/stock";
import type { Db } from "./index";
import { products, stockMovements } from "./schema";

export interface StockMovement {
  id: string;
  createdAt: Date;
  type: StockMovementType;
  delta: number;
  resultingQuantity: number;
}

// Writes a Stock Movement and the Stock column it leaves in one transaction,
// never one without the other (ADR 0003).
async function applyMovement(
  db: Db,
  productId: string,
  type: StockMovementType,
  change: (current: StockState) => StockChange,
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

// The Product's Stock Movement history, newest first.
export async function listStockMovements(db: Db, productId: string): Promise<StockMovement[]> {
  return db
    .select({
      id: stockMovements.id,
      createdAt: stockMovements.createdAt,
      type: stockMovements.type,
      delta: stockMovements.delta,
      resultingQuantity: stockMovements.resultingQuantity,
    })
    .from(stockMovements)
    .where(eq(stockMovements.productId, productId))
    .orderBy(desc(stockMovements.createdAt));
}
