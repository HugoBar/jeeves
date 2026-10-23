import "server-only";
import { desc, eq } from "drizzle-orm";
import { restock, type StockMovementType } from "@/core/stock";
import type { Db } from "./index";
import { products, stockMovements } from "./schema";

export interface StockMovement {
  id: string;
  createdAt: Date;
  type: StockMovementType;
  delta: number;
  resultingQuantity: number;
}

// Adds food bought to the Product's Stock. The movement and the Stock column
// are written in one transaction, never one without the other (ADR 0003).
export async function restockProduct(db: Db, productId: string, quantity: number): Promise<void> {
  await db.transaction(async (tx) => {
    // Locked so a concurrent movement cannot apply to the same starting Stock.
    const [current] = await tx
      .select({ stock: products.stock, stockSuspect: products.stockSuspect })
      .from(products)
      .where(eq(products.id, productId))
      .for("update");
    if (!current) throw new Error("Product not found");
    const change = restock(current, quantity);
    await tx.insert(stockMovements).values({
      productId,
      type: "restock",
      delta: change.delta,
      resultingQuantity: change.resultingQuantity,
    });
    await tx
      .update(products)
      .set({ stock: change.resultingQuantity, stockSuspect: change.stockSuspect })
      .where(eq(products.id, productId));
  });
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
