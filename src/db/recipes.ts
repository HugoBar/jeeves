import "server-only";
import { asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { Ingredient, PickableProduct } from "@/core/ingredients";
import { deriveFoodCategoryIds, type RecipeFields } from "@/core/recipes";
import { deleteOrArchive, type RemoveOutcome } from "./archive";
import { activeCategoryIdsByProduct, type FoodCategory } from "./food-categories";
import type { Db } from "./index";
import { foodCategories, ingredients, products, recipes } from "./schema";

export interface Recipe extends RecipeFields {
  id: string;
}

export interface RecipeIngredient extends Ingredient {
  productName: string;
}

type RecipeRow = typeof recipes.$inferSelect;

function toRecipe({ id, name, portions, steps, prepTimeMinutes, sourceUrl }: RecipeRow): Recipe {
  return { id, name, portions, steps, prepTimeMinutes, sourceUrl };
}

// The Recipes list: every Recipe that is not Archived.
export async function listActiveRecipes(db: Db): Promise<Recipe[]> {
  const rows = await db.select().from(recipes).where(isNull(recipes.archivedAt));
  return rows.map(toRecipe);
}

// `recipeIngredients` must already be checked by core's parseIngredients.
export async function createRecipe(db: Db, fields: RecipeFields, recipeIngredients: Ingredient[]): Promise<Recipe> {
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(recipes).values(fields).returning();
    await insertIngredients(tx, row!.id, recipeIngredients);
    return toRecipe(row!);
  });
}

export async function getRecipe(db: Db, id: string): Promise<Recipe | undefined> {
  const [row] = await db.select().from(recipes).where(eq(recipes.id, id));
  return row && toRecipe(row);
}

// Saving replaces every Ingredient, renumbering them in the order given.
export async function updateRecipe(
  db: Db,
  id: string,
  changes: RecipeFields,
  recipeIngredients: Ingredient[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(recipes).set(changes).where(eq(recipes.id, id));
    await tx.delete(ingredients).where(eq(ingredients.recipeId, id));
    await insertIngredients(tx, id, recipeIngredients);
  });
}

async function insertIngredients(db: Db, recipeId: string, recipeIngredients: Ingredient[]): Promise<void> {
  if (recipeIngredients.length === 0) return;
  await db
    .insert(ingredients)
    .values(recipeIngredients.map((ingredient, position) => ({ ...ingredient, recipeId, position })));
}

// A Recipe's Ingredients in the order entered, with their Product's name.
export async function listRecipeIngredients(db: Db, recipeId: string): Promise<RecipeIngredient[]> {
  return db
    .select({
      productId: ingredients.productId,
      productName: products.name,
      amount: ingredients.amount,
      unit: ingredients.unit,
      minor: ingredients.minor,
    })
    .from(ingredients)
    .innerJoin(products, eq(products.id, ingredients.productId))
    .where(eq(ingredients.recipeId, recipeId))
    .orderBy(asc(ingredients.position));
}

// A Recipe's derived Food Categories, computed from its Ingredients on every
// read. Archived categories are left out, even where a Product still links to
// them.
export async function listRecipeFoodCategories(db: Db, recipeId: string): Promise<FoodCategory[]> {
  const rows = await db
    .select({ productId: ingredients.productId, minor: ingredients.minor })
    .from(ingredients)
    .where(eq(ingredients.recipeId, recipeId));
  const categoryIdsByProduct = await activeCategoryIdsByProduct(db, [...new Set(rows.map((row) => row.productId))]);
  const ids = deriveFoodCategoryIds(
    rows.map((row) => ({ minor: row.minor, categoryIds: categoryIdsByProduct.get(row.productId)! })),
  );
  if (ids.length === 0) return [];
  return db.select().from(foodCategories).where(inArray(foodCategories.id, ids));
}

export interface PickableProductRow extends PickableProduct {
  id: string;
  archived: boolean;
}

// The Products an Ingredient can use, by name: the non-Archived ones, plus
// any Archived one the Recipe being edited already uses, so saving it never
// drops or swaps out that Ingredient.
export async function listPickableProducts(db: Db, recipeId?: string): Promise<PickableProductRow[]> {
  const usedByRecipe = recipeId
    ? inArray(
        products.id,
        db.select({ id: ingredients.productId }).from(ingredients).where(eq(ingredients.recipeId, recipeId)),
      )
    : undefined;
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      defaultUnit: products.defaultUnit,
      density: products.density,
      archived: sql<boolean>`${products.archivedAt} is not null`,
    })
    .from(products)
    .where(or(isNull(products.archivedAt), usedByRecipe));
  // Sorted here rather than by the database's collation, which may put
  // capitals before lowercase.
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

// A Recipe something refers to is only Archived. Its own Ingredients and Food
// Category overrides must cascade so they never block deletion.
export function removeRecipe(db: Db, id: string): Promise<RemoveOutcome> {
  return deleteOrArchive(db, recipes, id);
}
