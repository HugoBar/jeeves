import "server-only";
import { and, asc, eq, inArray, lte } from "drizzle-orm";
import type { MealSlotContent } from "@/core/meals";
import type { ProjectedMeal, ProjectedProduct, ProjectedRecipe, ProjectedSlot } from "@/core/projected-stock";
import type { Db } from "./index";
import { ingredients, mealSlots, meals, mealTypes, products, recipes } from "./schema";

// A Product as projecting needs it, with the name its slots' warnings show.
export interface ProjectedProductWithName extends ProjectedProduct {
  name: string;
}

// What core's projectStock needs to project up to `to`: every Meal not yet
// eaten as far as Stock knows (Planned or Unconfirmed, both stored as
// "planned"), tracked, on or before `to`. Earlier days count however far
// back, as an Unconfirmed Meal still takes Stock from the ones after it.
// Products come with their names, which the warnings show.
export async function loadStockProjection(
  db: Db,
  to: string,
): Promise<{ meals: ProjectedMeal[]; products: Map<string, ProjectedProductWithName> }> {
  const mealRows = await db
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
    .where(and(eq(meals.status, "planned"), eq(meals.untracked, false), lte(meals.date, to)));
  const { slotsByMeal, products } = await loadMealSlots(db, mealRows.map((meal) => meal.id));
  return {
    // Postgres reads a `time` back as "HH:MM:SS"; core works in "HH:MM".
    meals: mealRows.map((meal) => ({ ...meal, hour: meal.hour.slice(0, 5), slots: slotsByMeal.get(meal.id)! })),
    products,
  };
}

// Each Meal's slots in order, as working out what they need takes them, by
// Meal id, and every Product they use. Recipes and Products are loaded even
// when Archived: a slot keeps them. Products come with their names, which
// warnings and refusals show.
export async function loadMealSlots(
  db: Db,
  mealIds: string[],
): Promise<{ slotsByMeal: Map<string, ProjectedSlot[]>; products: Map<string, ProjectedProductWithName> }> {
  const slotRows =
    mealIds.length === 0
      ? []
      : await db
          .select({
            mealId: mealSlots.mealId,
            id: mealSlots.id,
            content: mealSlots.content,
            recipeId: mealSlots.recipeId,
            portions: mealSlots.portions,
            productId: mealSlots.productId,
            quantity: mealSlots.quantity,
          })
          .from(mealSlots)
          .where(inArray(mealSlots.mealId, mealIds))
          .orderBy(asc(mealSlots.position));

  const recipesById = await recipesFor(db, [
    ...new Set(slotRows.flatMap((slot) => (slot.recipeId ? [slot.recipeId] : []))),
  ]);
  const productIds = new Set(slotRows.flatMap((slot) => (slot.productId ? [slot.productId] : [])));
  for (const recipe of recipesById.values()) {
    for (const ingredient of recipe.ingredients) productIds.add(ingredient.productId);
  }

  const slotsByMeal = new Map<string, ProjectedSlot[]>(mealIds.map((id) => [id, []]));
  for (const { mealId, ...slot } of slotRows) slotsByMeal.get(mealId)!.push(toSlot(slot, recipesById));
  return { slotsByMeal, products: await productsFor(db, [...productIds]) };
}

// The CHECKs on meal_slots guarantee the columns of the slot's content are
// set, and the references that its Recipe or Product exists.
function toSlot(
  slot: {
    id: string;
    content: MealSlotContent;
    recipeId: string | null;
    portions: number | null;
    productId: string | null;
    quantity: number | null;
  },
  recipesById: ReadonlyMap<string, ProjectedRecipe>,
): ProjectedSlot {
  switch (slot.content) {
    case "recipe":
      return { id: slot.id, content: "recipe", portions: slot.portions!, recipe: recipesById.get(slot.recipeId!)! };
    case "product":
      return { id: slot.id, content: "product", productId: slot.productId!, quantity: slot.quantity! };
    default:
      return { id: slot.id, content: slot.content };
  }
}

// Each Recipe's Portions and Ingredients in order, Minor ones too, by id.
async function recipesFor(db: Db, ids: string[]): Promise<Map<string, ProjectedRecipe>> {
  if (ids.length === 0) return new Map();
  const [recipeRows, ingredientRows] = await Promise.all([
    db.select({ id: recipes.id, portions: recipes.portions }).from(recipes).where(inArray(recipes.id, ids)),
    db
      .select({
        recipeId: ingredients.recipeId,
        productId: ingredients.productId,
        amount: ingredients.amount,
        unit: ingredients.unit,
      })
      .from(ingredients)
      .where(inArray(ingredients.recipeId, ids))
      .orderBy(asc(ingredients.position)),
  ]);
  const byId = new Map<string, ProjectedRecipe>(
    recipeRows.map(({ id, portions }) => [id, { portions, ingredients: [] }]),
  );
  for (const { recipeId, ...ingredient } of ingredientRows) byId.get(recipeId)!.ingredients.push(ingredient);
  return byId;
}

// Each Product's Stock and what converting to its Default Unit needs, by id.
async function productsFor(db: Db, ids: string[]): Promise<Map<string, ProjectedProductWithName>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      defaultUnit: products.defaultUnit,
      density: products.density,
      stock: products.stock,
    })
    .from(products)
    .where(inArray(products.id, ids));
  return new Map(rows.map(({ id, ...product }) => [id, product]));
}
