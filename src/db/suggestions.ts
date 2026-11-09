import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { addDays } from "@/core/planner";
import type { ProjectedProduct } from "@/core/projected-stock";
import {
  VARIETY_WINDOW_DAYS,
  type SlotFill,
  type SuggestionCandidate,
  type SuggestionCategory,
  type SuggestionMeal,
} from "@/core/suggestions";
import { activeCategoryIdsByProduct } from "./food-categories";
import type { Db } from "./index";
import { listFoodsForSlots } from "./meals";
import { loadMealSlots } from "./projected-stock";
import { finalCategoryIdsByRecipe } from "./recipes";
import { foodCategories, ingredients, mealSlots, meals, mealTypes, products } from "./schema";

// What core's Suggestions need for the days from `from` to `to`, all but the
// slot and the viewer's date.
export interface SuggestionContext {
  meals: SuggestionMeal[];
  candidates: SuggestionCandidate[];
  categories: Map<string, SuggestionCategory>;
  products: Map<string, ProjectedProduct>;
  // The quantity each Product last had in a Meal Slot, by Product id: in the
  // latest Meal holding it, of any status.
  quantities: Map<string, number>;
}

// Everything Suggestions for a slot from `from` to `to` look at (spec
// "Suggestions"): every Meal of any status from VARIETY_WINDOW_DAYS before
// `from` to `to`, which variety compares against, and every Meal not yet
// eaten as far as Stock knows up to `to`, however far back, which Projected
// Stock takes from. The candidates are the non-Archived Recipes and Products,
// by name. Every Product comes with its Stock, and every Food Category with
// its Role or Kind and whether it is Archived.
export async function loadSuggestionContext(db: Db, from: string, to: string): Promise<SuggestionContext> {
  const [mealRows, foods, categoryRows, productRows, quantities] = await Promise.all([
    db
      .select({
        id: meals.id,
        date: meals.date,
        hour: meals.hour,
        createdAt: meals.createdAt,
        priority: mealTypes.priority,
        status: meals.status,
        untracked: meals.untracked,
      })
      .from(meals)
      .innerJoin(mealTypes, eq(meals.mealTypeId, mealTypes.id))
      .where(
        or(
          and(eq(meals.status, "planned"), lte(meals.date, to)),
          and(gte(meals.date, addDays(from, -VARIETY_WINDOW_DAYS)), lte(meals.date, to)),
        ),
      ),
    listFoodsForSlots(db),
    db
      .select({
        id: foodCategories.id,
        kind: foodCategories.kind,
        archived: sql<boolean>`${foodCategories.archivedAt} is not null`,
      })
      .from(foodCategories),
    db
      .select({ id: products.id, defaultUnit: products.defaultUnit, density: products.density, stock: products.stock })
      .from(products),
    lastQuantities(db),
  ]);
  const mealIds = mealRows.map((meal) => meal.id);
  const [{ slotsByMeal }, slotRows, ingredientRows] = await Promise.all([
    loadMealSlots(db, mealIds),
    mealIds.length === 0
      ? []
      : db
          .select({
            id: mealSlots.id,
            slotCategoryId: mealSlots.slotCategoryId,
            recipeId: mealSlots.recipeId,
            productId: mealSlots.productId,
          })
          .from(mealSlots)
          .where(inArray(mealSlots.mealId, mealIds)),
    foods.recipes.length === 0
      ? []
      : db
          .select({
            recipeId: ingredients.recipeId,
            productId: ingredients.productId,
            amount: ingredients.amount,
            unit: ingredients.unit,
            minor: ingredients.minor,
          })
          .from(ingredients)
          .where(inArray(ingredients.recipeId, foods.recipes.map((recipe) => recipe.id)))
          .orderBy(asc(ingredients.position)),
  ]);

  // The final Food Categories of what the slots hold, Archived Recipes and
  // Products included: a slot keeps them.
  const unique = (ids: (string | null)[]) => [...new Set(ids.filter((id) => id !== null))];
  const [recipeCategories, productCategories] = await Promise.all([
    finalCategoryIdsByRecipe(db, unique(slotRows.map((slot) => slot.recipeId))),
    activeCategoryIdsByProduct(db, unique(slotRows.map((slot) => slot.productId))),
  ]);
  const slotById = new Map(slotRows.map((slot) => [slot.id, slot]));
  const foodOf = ({ recipeId, productId }: { recipeId: string | null; productId: string | null }) => {
    if (recipeId) return { id: recipeId, categoryIds: recipeCategories.get(recipeId)! };
    if (productId) return { id: productId, categoryIds: productCategories.get(productId)! };
    return null;
  };

  const ingredientsByRecipe = Map.groupBy(ingredientRows, (row) => row.recipeId);
  const candidates: SuggestionCandidate[] = [
    ...foods.recipes.map(({ id, name, portions, categoryIds }) => ({
      name,
      candidate: {
        content: "recipe" as const,
        id,
        categoryIds,
        recipe: {
          portions,
          ingredients: (ingredientsByRecipe.get(id) ?? []).map(({ productId, amount, unit, minor }) => ({ productId, amount, unit, minor })),
        },
      },
    })),
    ...foods.products.map(({ id, name, categoryIds }) => ({
      name,
      candidate: { content: "product" as const, id, categoryIds },
    })),
  ]
    // As the slot picker lists them, so ties keep the order the user sees.
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    .map(({ candidate }) => candidate);

  return {
    // Postgres reads a `time` back as "HH:MM:SS"; core works in "HH:MM".
    meals: mealRows.map((meal) => ({
      ...meal,
      hour: meal.hour.slice(0, 5),
      slots: slotsByMeal.get(meal.id)!.map((slot) => {
        const row = slotById.get(slot.id)!;
        return { ...slot, slotCategoryId: row.slotCategoryId, food: foodOf(row) };
      }),
    })),
    candidates,
    categories: new Map(categoryRows.map(({ id, ...category }) => [id, category])),
    products: new Map(productRows.map(({ id, ...product }) => [id, product])),
    quantities,
  };
}

// The quantity each Product had in the latest Meal holding it: by day, then
// hour, then the Meal created last.
async function lastQuantities(db: Db): Promise<Map<string, number>> {
  const rows = await db
    .selectDistinctOn([mealSlots.productId], { productId: mealSlots.productId, quantity: mealSlots.quantity })
    .from(mealSlots)
    .innerJoin(meals, eq(mealSlots.mealId, meals.id))
    .where(eq(mealSlots.content, "product"))
    .orderBy(mealSlots.productId, desc(meals.date), desc(meals.hour), desc(meals.createdAt));
  // The CHECKs on meal_slots guarantee a Product slot has both.
  return new Map(rows.map((row) => [row.productId!, row.quantity!]));
}

// Every food column of a slot cleared, as an empty slot has them.
const NO_FOOD = { recipeId: null, portions: null, productId: null, quantity: null };

// The ids of the Meals whose slots can still change: Planned or Unconfirmed.
function changeableMealIds(db: Db) {
  return db.select({ id: meals.id }).from(meals).where(eq(meals.status, "planned"));
}

// "Fill empty slots" written, each fill already worked out by core's
// fillEmptySlots. A slot is filled only while it is still empty and its Meal
// can change, so a fill never overwrites what was put in since. The fills
// written, in the order given.
export async function fillEmptyMealSlots(db: Db, fills: readonly SlotFill[]): Promise<SlotFill[]> {
  return db.transaction(async (tx) => {
    const written: SlotFill[] = [];
    for (const slotFill of fills) {
      const rows = await tx
        .update(mealSlots)
        .set({ ...NO_FOOD, ...slotFill.fill })
        .where(
          and(
            eq(mealSlots.id, slotFill.slotId),
            eq(mealSlots.content, "empty"),
            inArray(mealSlots.mealId, changeableMealIds(tx)),
          ),
        )
        .returning({ id: mealSlots.id });
      if (rows.length > 0) written.push(slotFill);
    }
    return written;
  });
}

// Undo of "Fill empty slots": each slot empty again while it still holds
// exactly what the fill put in and its Meal can change. A slot changed since
// keeps its change.
export async function undoFill(db: Db, fills: readonly SlotFill[]): Promise<void> {
  await db.transaction(async (tx) => {
    for (const { slotId, fill } of fills) {
      const holding =
        fill.content === "recipe"
          ? and(eq(mealSlots.recipeId, fill.recipeId), eq(mealSlots.portions, fill.portions))
          : and(eq(mealSlots.productId, fill.productId), eq(mealSlots.quantity, fill.quantity));
      await tx
        .update(mealSlots)
        .set({ content: "empty", ...NO_FOOD })
        .where(
          and(
            eq(mealSlots.id, slotId),
            eq(mealSlots.content, fill.content),
            holding,
            inArray(mealSlots.mealId, changeableMealIds(tx)),
          ),
        );
    }
  });
}
