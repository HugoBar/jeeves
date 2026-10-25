import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { ProductFields } from "@/core/products";
import type { DefaultUnit } from "@/core/units";
import { deleteOrArchive, type RemoveOutcome } from "./archive";
import { activeCategoryIds, keepActiveCategoryIds } from "./food-categories";
import type { Db } from "./index";
import { isUniqueViolation } from "./postgres-errors";
import { productFoodCategories, products } from "./schema";

// `categoryIds` holds only non-Archived Food Categories: Archived ones are
// hidden on the Product, though their links are kept.
export interface Product extends ProductFields {
  id: string;
  defaultUnit: DefaultUnit;
  stock: number;
  // "Stock was probably wrong": set when a deduction had to clamp at 0.
  stockSuspect: boolean;
}

type ProductRow = typeof products.$inferSelect;

function toProduct(row: ProductRow, categoryIds: string[]): Product {
  return {
    id: row.id,
    name: row.name,
    defaultUnit: row.defaultUnit,
    density: row.density,
    packSize:
      row.packSizeName === null || row.packSizeAmount === null
        ? null
        : { name: row.packSizeName, amount: row.packSizeAmount },
    categoryIds,
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

// Each Product's links to non-Archived Food Categories, by Product id.
async function activeCategoryIdsByProduct(db: Db, productIds: string[]): Promise<Map<string, string[]>> {
  const byProduct = new Map<string, string[]>(productIds.map((id) => [id, []]));
  if (productIds.length === 0) return byProduct;
  const links = await db
    .select()
    .from(productFoodCategories)
    .where(
      and(
        inArray(productFoodCategories.productId, productIds),
        inArray(productFoodCategories.categoryId, activeCategoryIds(db)),
      ),
    );
  for (const link of links) byProduct.get(link.productId)!.push(link.categoryId);
  return byProduct;
}

// The Stock list: every Product that is not Archived.
export async function listActiveProducts(db: Db): Promise<Product[]> {
  const rows = await db.select().from(products).where(isNull(products.archivedAt));
  const categoryIds = await activeCategoryIdsByProduct(db, rows.map((row) => row.id));
  return rows.map((row) => toProduct(row, categoryIds.get(row.id)!));
}

// Another non-Archived Product already has the name, ignoring case.
type DuplicateName = { ok: false; error: "duplicateName" };

// A new Product starts with no Stock; Stock only changes through Stock Movements.
export async function createProduct(
  db: Db,
  input: ProductFields & { defaultUnit: DefaultUnit },
): Promise<{ ok: true; product: Product } | DuplicateName> {
  try {
    const product = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(products)
        .values({ ...toColumns(input), defaultUnit: input.defaultUnit })
        .returning();
      return toProduct(row!, await linkCategories(tx, row!.id, input.categoryIds));
    });
    return { ok: true, product };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "duplicateName" };
    throw error;
  }
}

export async function getProduct(db: Db, id: string): Promise<Product | undefined> {
  const [row] = await db.select().from(products).where(eq(products.id, id));
  if (!row) return undefined;
  const categoryIds = await activeCategoryIdsByProduct(db, [id]);
  return toProduct(row, categoryIds.get(id)!);
}

// The Default Unit is fixed at creation, so it is not among the changes.
export async function updateProduct(
  db: Db,
  id: string,
  changes: ProductFields,
): Promise<{ ok: true } | DuplicateName> {
  try {
    await db.transaction(async (tx) => {
      await tx.update(products).set(toColumns(changes)).where(eq(products.id, id));
      // Archived categories cannot be picked, so their links are not among the
      // changes and are kept.
      await tx
        .delete(productFoodCategories)
        .where(
          and(
            eq(productFoodCategories.productId, id),
            inArray(productFoodCategories.categoryId, activeCategoryIds(tx)),
          ),
        );
      await linkCategories(tx, id, changes.categoryIds);
    });
    return { ok: true };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "duplicateName" };
    throw error;
  }
}

// Links the Product to the picked categories that are not Archived, and
// returns their ids. One Archived after the form was loaded is left out.
async function linkCategories(db: Db, productId: string, categoryIds: string[]): Promise<string[]> {
  const active = await keepActiveCategoryIds(db, categoryIds);
  if (active.length > 0) {
    await db.insert(productFoodCategories).values(active.map((categoryId) => ({ productId, categoryId })));
  }
  return active;
}

// A Stock Movement refers to its Product, so one ever Restocked is only
// Archived. Its own Food Category links cascade and never block deletion.
export function removeProduct(db: Db, id: string): Promise<RemoveOutcome> {
  return deleteOrArchive(db, products, id);
}
