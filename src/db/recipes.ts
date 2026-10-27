import "server-only";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { Ingredient, PickableProduct } from "@/core/ingredients";
import {
  applyCategoryOverrides,
  deriveFoodCategoryIds,
  type CategoryOverride,
  type RecipeContent,
  type RecipeFields,
} from "@/core/recipes";
import { deleteOrArchive, type RemoveOutcome } from "./archive";
import {
  activeCategoryIds,
  activeCategoryIdsByProduct,
  replaceActiveCategoryLinks,
  type CategoryLinkTable,
  type FoodCategory,
} from "./food-categories";
import type { Db } from "./index";
import { foodCategories, ingredients, products, recipeCategoryOverrides, recipes } from "./schema";

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

// The Ingredients must already be checked by core's parseIngredients.
export async function createRecipe(
  db: Db,
  { ingredients: recipeIngredients, categoryOverrides, ...fields }: RecipeContent,
): Promise<Recipe> {
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(recipes).values(fields).returning();
    await insertIngredients(tx, row!.id, recipeIngredients);
    await saveOverrides(tx, row!.id, categoryOverrides);
    return toRecipe(row!);
  });
}

export async function getRecipe(db: Db, id: string): Promise<Recipe | undefined> {
  const [row] = await db.select().from(recipes).where(eq(recipes.id, id));
  return row && toRecipe(row);
}

// Saving replaces every Ingredient, renumbering them in the order given, and
// every override on a non-Archived category.
export async function updateRecipe(
  db: Db,
  id: string,
  { ingredients: recipeIngredients, categoryOverrides, ...changes }: RecipeContent,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(recipes).set(changes).where(eq(recipes.id, id));
    await tx.delete(ingredients).where(eq(ingredients.recipeId, id));
    await insertIngredients(tx, id, recipeIngredients);
    await saveOverrides(tx, id, categoryOverrides);
  });
}

async function insertIngredients(db: Db, recipeId: string, recipeIngredients: Ingredient[]): Promise<void> {
  if (recipeIngredients.length === 0) return;
  await db
    .insert(ingredients)
    .values(recipeIngredients.map((ingredient, position) => ({ ...ingredient, recipeId, position })));
}

const CATEGORY_OVERRIDE_LINKS: CategoryLinkTable<typeof recipeCategoryOverrides> = {
  table: recipeCategoryOverrides,
  ownerId: recipeCategoryOverrides.recipeId,
  categoryId: recipeCategoryOverrides.categoryId,
};

// Only overrides on non-Archived categories are saved. Those on Archived ones
// are hidden on the form, so they are kept.
async function saveOverrides(db: Db, recipeId: string, overrides: CategoryOverride[]): Promise<void> {
  await replaceActiveCategoryLinks(
    db,
    CATEGORY_OVERRIDE_LINKS,
    recipeId,
    overrides.map((override) => ({ ...override, recipeId })),
  );
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

// A Recipe's overrides on non-Archived Food Categories. Those on Archived
// ones are kept but ignored.
export async function listRecipeCategoryOverrides(db: Db, recipeId: string): Promise<CategoryOverride[]> {
  return db
    .select({ categoryId: recipeCategoryOverrides.categoryId, mode: recipeCategoryOverrides.mode })
    .from(recipeCategoryOverrides)
    .where(
      and(
        eq(recipeCategoryOverrides.recipeId, recipeId),
        inArray(recipeCategoryOverrides.categoryId, activeCategoryIds(db)),
      ),
    );
}

export interface RecipeFoodCategories {
  // From the Ingredients alone.
  derived: FoodCategory[];
  // The derived ones adjusted by the Recipe's overrides.
  final: FoodCategory[];
}

// A Recipe's Food Categories, computed from its Ingredients and overrides on
// every read. Archived categories are left out of both sets, even where a
// Product or an override still points at them.
export async function getRecipeFoodCategories(db: Db, recipeId: string): Promise<RecipeFoodCategories> {
  const [rows, overrides] = await Promise.all([
    db
      .select({ productId: ingredients.productId, minor: ingredients.minor })
      .from(ingredients)
      .where(eq(ingredients.recipeId, recipeId)),
    listRecipeCategoryOverrides(db, recipeId),
  ]);
  const categoryIdsByProduct = await activeCategoryIdsByProduct(db, [...new Set(rows.map((row) => row.productId))]);
  const derivedIds = deriveFoodCategoryIds(
    rows.map((row) => ({ minor: row.minor, categoryIds: categoryIdsByProduct.get(row.productId)! })),
  );
  const finalIds = applyCategoryOverrides(derivedIds, overrides);
  const ids = [...new Set([...derivedIds, ...finalIds])];
  if (ids.length === 0) return { derived: [], final: [] };
  const categories = await db.select().from(foodCategories).where(inArray(foodCategories.id, ids));
  return {
    derived: categories.filter((category) => derivedIds.includes(category.id)),
    final: categories.filter((category) => finalIds.includes(category.id)),
  };
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
