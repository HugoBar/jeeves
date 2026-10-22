import "server-only";
import { eq, isNull } from "drizzle-orm";
import type { ProductFields } from "@/core/products";
import type { DefaultUnit } from "@/core/units";
import type { Db } from "./index";
import { products } from "./schema";

export interface Product extends ProductFields {
  id: string;
  defaultUnit: DefaultUnit;
  stock: number;
  // "Stock was probably wrong": set when a deduction had to clamp at 0.
  stockSuspect: boolean;
}

type ProductRow = typeof products.$inferSelect;

function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    defaultUnit: row.defaultUnit,
    density: row.density,
    packSize:
      row.packSizeName === null || row.packSizeAmount === null
        ? null
        : { name: row.packSizeName, amount: row.packSizeAmount },
    stock: row.stock,
    stockSuspect: row.stockSuspect,
  };
}

// The Pack Size is stored as two columns, both set or both null.
function toColumns({ name, density, packSize }: ProductFields) {
  return {
    name,
    density,
    packSizeName: packSize?.name ?? null,
    packSizeAmount: packSize?.amount ?? null,
  };
}

// The Stock list: every Product that is not Archived.
export async function listActiveProducts(db: Db): Promise<Product[]> {
  const rows = await db.select().from(products).where(isNull(products.archivedAt));
  return rows.map(toProduct);
}

// A new Product starts with no Stock; Stock only changes through Stock Movements.
export async function createProduct(
  db: Db,
  input: ProductFields & { defaultUnit: DefaultUnit },
): Promise<Product> {
  const [row] = await db
    .insert(products)
    .values({ ...toColumns(input), defaultUnit: input.defaultUnit })
    .returning();
  return toProduct(row!);
}

export async function getProduct(db: Db, id: string): Promise<Product | undefined> {
  const [row] = await db.select().from(products).where(eq(products.id, id));
  return row && toProduct(row);
}

// The Default Unit is fixed at creation, so it is not among the changes.
export async function updateProduct(db: Db, id: string, changes: ProductFields): Promise<void> {
  await db.update(products).set(toColumns(changes)).where(eq(products.id, id));
}
