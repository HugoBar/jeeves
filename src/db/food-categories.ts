import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { CategoryKind } from "@/core/food-categories";
import { deleteOrArchive, type RemoveOutcome } from "./archive";
import type { Db } from "./index";
import { foodCategories, productFoodCategories } from "./schema";

export type FoodCategory = typeof foodCategories.$inferSelect;

// What pickers offer: every category that is not Archived.
export function listActiveCategories(db: Db): Promise<FoodCategory[]> {
  return db.select().from(foodCategories).where(isNull(foodCategories.archivedAt));
}

// The ids of every category that is not Archived, as a subquery for other
// tables' queries (`inArray(column, activeCategoryIds(db))`).
export function activeCategoryIds(db: Db) {
  return db.select({ id: foodCategories.id }).from(foodCategories).where(isNull(foodCategories.archivedAt));
}

// Each Product's links to non-Archived Food Categories, by Product id.
export async function activeCategoryIdsByProduct(db: Db, productIds: string[]): Promise<Map<string, string[]>> {
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

// Of the given ids, those of categories that exist and are not Archived.
export async function keepActiveCategoryIds(db: Db, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: foodCategories.id })
    .from(foodCategories)
    .where(and(inArray(foodCategories.id, ids), isNull(foodCategories.archivedAt)));
  return rows.map((row) => row.id);
}

export async function createCategory(
  db: Db,
  input: { name: string; kind: CategoryKind },
): Promise<FoodCategory> {
  const [category] = await db.insert(foodCategories).values(input).returning();
  return category!;
}

export async function getCategory(db: Db, id: string): Promise<FoodCategory | undefined> {
  const [category] = await db.select().from(foodCategories).where(eq(foodCategories.id, id));
  return category;
}

// A seeded category keeps its key; a stored name overrides the key's string.
export async function updateCategory(
  db: Db,
  id: string,
  changes: { name: string | null; kind: CategoryKind },
): Promise<void> {
  await db.update(foodCategories).set(changes).where(eq(foodCategories.id, id));
}

// A category a Product carries is only Archived; its links are kept.
export function removeCategory(db: Db, id: string): Promise<RemoveOutcome> {
  return deleteOrArchive(db, foodCategories, id);
}
