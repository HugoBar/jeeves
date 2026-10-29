import "server-only";
import { and, asc, eq, gt, gte, inArray, lte, max, sql } from "drizzle-orm";
import {
  slotKeepsFood,
  type MealChanges,
  type MealSlotContent,
  type MealSlotFill,
  type MealStatus,
  type NewMealFields,
  type NewMealSlot,
  type NewMealFromTemplateFields,
} from "@/core/meals";
import type { DefaultUnit } from "@/core/units";
import { activeCategoryIdsByProduct, type FoodCategory } from "./food-categories";
import type { Db } from "./index";
import { getMealTemplate } from "./meal-templates";
import type { MealType } from "./meal-types";
import { listActiveProducts } from "./products";
import { finalCategoryIdsByRecipe, listActiveRecipes } from "./recipes";
import { foodCategories, mealSlots, meals, mealTypes, products, recipes } from "./schema";

// What a Meal Slot holds, with what its card needs of its Recipe or Product.
// That Recipe or Product may be Archived: the slot keeps it.
export type MealSlotFood =
  | { content: "empty" | "leftovers" }
  | { content: "recipe"; recipeId: string; portions: number; recipe: { name: string; archived: boolean } }
  | {
      content: "product";
      productId: string;
      quantity: number;
      product: { name: string; defaultUnit: DefaultUnit; archived: boolean };
    };

// A Meal Slot with what its card needs of its Slot Category and food. That
// category may be Archived: the slot keeps it until it is changed.
export type MealSlot = {
  id: string;
  slotCategoryId: string;
  slotCategory: Pick<FoodCategory, "seedKey" | "name"> & { archived: boolean };
} & MealSlotFood;

// A Meal as the planner shows it, with what its card needs of its Meal Type
// and its slots in order. That Meal Type may be Archived: the Meal keeps it.
export interface Meal extends NewMealFields {
  id: string;
  createdAt: Date;
  status: MealStatus;
  untracked: boolean;
  mealType: Pick<MealType, "seedKey" | "name" | "allowsLeftovers"> & { archived: boolean };
  slots: MealSlot[];
}

function selectMeals(db: Db) {
  return db
    .select({
      id: meals.id,
      createdAt: meals.createdAt,
      date: meals.date,
      hour: meals.hour,
      name: meals.name,
      mealTypeId: meals.mealTypeId,
      status: meals.status,
      untracked: meals.untracked,
      mealType: {
        seedKey: mealTypes.seedKey,
        name: mealTypes.name,
        allowsLeftovers: mealTypes.allowsLeftovers,
        archived: sql<boolean>`${mealTypes.archivedAt} is not null`,
      },
    })
    .from(meals)
    .innerJoin(mealTypes, eq(meals.mealTypeId, mealTypes.id));
}

// Each Meal's slots in order, by Meal id.
async function slotsByMeal(db: Db, mealIds: string[]): Promise<Map<string, MealSlot[]>> {
  const byMeal = new Map<string, MealSlot[]>(mealIds.map((id) => [id, []]));
  if (mealIds.length === 0) return byMeal;
  const rows = await db
    .select({
      mealId: mealSlots.mealId,
      id: mealSlots.id,
      slotCategoryId: mealSlots.slotCategoryId,
      slotCategory: {
        seedKey: foodCategories.seedKey,
        name: foodCategories.name,
        archived: sql<boolean>`${foodCategories.archivedAt} is not null`,
      },
      content: mealSlots.content,
      recipeId: mealSlots.recipeId,
      portions: mealSlots.portions,
      recipeName: recipes.name,
      recipeArchived: sql<boolean>`${recipes.archivedAt} is not null`,
      productId: mealSlots.productId,
      quantity: mealSlots.quantity,
      productName: products.name,
      productDefaultUnit: products.defaultUnit,
      productArchived: sql<boolean>`${products.archivedAt} is not null`,
    })
    .from(mealSlots)
    .innerJoin(foodCategories, eq(mealSlots.slotCategoryId, foodCategories.id))
    .leftJoin(recipes, eq(mealSlots.recipeId, recipes.id))
    .leftJoin(products, eq(mealSlots.productId, products.id))
    .where(inArray(mealSlots.mealId, mealIds))
    .orderBy(asc(mealSlots.position));
  for (const { mealId, id, slotCategoryId, slotCategory, ...food } of rows) {
    byMeal.get(mealId)!.push({ id, slotCategoryId, slotCategory, ...toFood(food) });
  }
  return byMeal;
}

// The CHECKs on meal_slots guarantee the columns of the slot's content are
// set, and the references that its Recipe or Product exists.
function toFood(row: {
  content: MealSlotContent;
  recipeId: string | null;
  portions: number | null;
  recipeName: string | null;
  recipeArchived: boolean;
  productId: string | null;
  quantity: number | null;
  productName: string | null;
  productDefaultUnit: DefaultUnit | null;
  productArchived: boolean;
}): MealSlotFood {
  switch (row.content) {
    case "recipe":
      return {
        content: "recipe",
        recipeId: row.recipeId!,
        portions: row.portions!,
        recipe: { name: row.recipeName!, archived: row.recipeArchived },
      };
    case "product":
      return {
        content: "product",
        productId: row.productId!,
        quantity: row.quantity!,
        product: { name: row.productName!, defaultUnit: row.productDefaultUnit!, archived: row.productArchived },
      };
    default:
      return { content: row.content };
  }
}

// Rows with their slots added. Postgres reads a `time` back as "HH:MM:SS";
// core works in "HH:MM".
async function toMeals(db: Db, rows: Omit<Meal, "slots">[]): Promise<Meal[]> {
  const slots = await slotsByMeal(db, rows.map((row) => row.id));
  return rows.map((row) => ({ ...row, hour: row.hour.slice(0, 5), slots: slots.get(row.id)! }));
}

// Every Meal from `from` to `to`, both included, in no order.
export async function listMeals(db: Db, from: string, to: string): Promise<Meal[]> {
  return toMeals(db, await selectMeals(db).where(and(gte(meals.date, from), lte(meals.date, to))));
}

export async function getMeal(db: Db, id: string): Promise<Meal | undefined> {
  const [meal] = await toMeals(db, await selectMeals(db).where(eq(meals.id, id)));
  return meal;
}

// A Meal made from scratch: Planned, tracked, with no Meal Slots.
export async function createMeal(db: Db, fields: NewMealFields): Promise<{ id: string }> {
  const [row] = await db.insert(meals).values(fields).returning({ id: meals.id });
  return row!;
}

// Copies the template's name, Meal Type, hour and slots, each empty with the
// template slot's Slot Category, in order. The Meal keeps no link to the
// template (data-model Q5). Undefined if the template is gone.
export async function createMealFromTemplate(
  db: Db,
  { date, templateId }: NewMealFromTemplateFields,
): Promise<{ id: string } | undefined> {
  return db.transaction(async (tx) => {
    const template = await getMealTemplate(tx, templateId);
    if (!template) return undefined;
    const { name, hour, mealTypeId, slotCategoryIds } = template;
    const meal = await createMeal(tx, { date, hour, name, mealTypeId });
    if (slotCategoryIds.length > 0) {
      await tx
        .insert(mealSlots)
        .values(slotCategoryIds.map((slotCategoryId, position) => ({ mealId: meal.id, slotCategoryId, position })));
    }
    return meal;
  });
}

// The Meal, if it can still change: core's canChangeMeal, checked in the
// write itself so a Meal Confirmed meanwhile is left alone.
const changeable = (id: string) => and(eq(meals.id, id), eq(meals.status, "planned"));

// Its Meal Type never changes. Nothing if the Meal is Confirmed or Skipped.
export async function updateMeal(db: Db, id: string, changes: MealChanges): Promise<void> {
  await db.update(meals).set(changes).where(changeable(id));
}

// Every food column of a slot cleared, as an empty slot has them.
const NO_FOOD = { recipeId: null, portions: null, productId: null, quantity: null };

// The fill must already be checked by core's parseMealSlotFill. It replaces
// whatever the slot held; `{ content: "empty" }` empties it.
export async function fillMealSlot(db: Db, slotId: string, fill: MealSlotFill): Promise<void> {
  await db
    .update(mealSlots)
    .set({ ...NO_FOOD, ...fill })
    .where(eq(mealSlots.id, slotId));
}

// A slot added by hand, after the Meal's others. It must already be checked by
// core's parseNewMealSlot.
export async function addMealSlot(db: Db, mealId: string, { slotCategoryId, fill }: NewMealSlot): Promise<void> {
  await db.transaction(async (tx) => {
    const [last] = await tx
      .select({ position: max(mealSlots.position) })
      .from(mealSlots)
      .where(eq(mealSlots.mealId, mealId));
    const position = last?.position == null ? 0 : last.position + 1;
    await tx.insert(mealSlots).values({ mealId, slotCategoryId, position, ...NO_FOOD, ...fill });
  });
}

// The slots after it move up one, keeping their order (data-model T5). One at
// a time, first to last, as each takes the position just freed: the unique
// (meal, position) index is checked row by row. Nothing if the slot is gone.
export async function removeMealSlot(db: Db, slotId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [removed] = await tx
      .delete(mealSlots)
      .where(eq(mealSlots.id, slotId))
      .returning({ mealId: mealSlots.mealId, position: mealSlots.position });
    if (!removed) return;
    const after = await tx
      .select({ id: mealSlots.id, position: mealSlots.position })
      .from(mealSlots)
      .where(and(eq(mealSlots.mealId, removed.mealId), gt(mealSlots.position, removed.position)))
      .orderBy(asc(mealSlots.position));
    for (const slot of after) {
      await tx.update(mealSlots).set({ position: slot.position - 1 }).where(eq(mealSlots.id, slot.id));
    }
  });
}

// The Slot Category must already be checked by core's parseMealSlotCategory.
// A Recipe or Product that does not carry the new one is taken out, emptying
// the slot; Leftovers stay.
export async function setMealSlotCategory(db: Db, slotId: string, slotCategoryId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [slot] = await tx
      .select({ content: mealSlots.content, recipeId: mealSlots.recipeId, productId: mealSlots.productId })
      .from(mealSlots)
      .where(eq(mealSlots.id, slotId));
    if (!slot) return;
    const keeps = slotKeepsFood(slot.content, await foodCategoryIds(tx, slot), slotCategoryId);
    await tx
      .update(mealSlots)
      .set(keeps ? { slotCategoryId } : { slotCategoryId, content: "empty", ...NO_FOOD })
      .where(eq(mealSlots.id, slotId));
  });
}

// The non-Archived Food Categories of a slot's Recipe (final, after
// overrides) or Product; none for anything else.
async function foodCategoryIds(db: Db, slot: { recipeId: string | null; productId: string | null }): Promise<string[]> {
  if (slot.recipeId) return (await finalCategoryIdsByRecipe(db, [slot.recipeId])).get(slot.recipeId)!;
  if (slot.productId) return (await activeCategoryIdsByProduct(db, [slot.productId])).get(slot.productId)!;
  return [];
}

// What checking a change to a slot needs: its Slot Category, its Meal's
// status and day, and whether its Meal Type allows Leftovers. Undefined if
// the slot is gone.
export async function getMealSlotContext(
  db: Db,
  slotId: string,
): Promise<
  { slotCategoryId: string; allowsLeftovers: boolean; meal: Pick<Meal, "status" | "date"> } | undefined
> {
  const [row] = await db
    .select({
      slotCategoryId: mealSlots.slotCategoryId,
      allowsLeftovers: mealTypes.allowsLeftovers,
      meal: { status: meals.status, date: meals.date },
    })
    .from(mealSlots)
    .innerJoin(meals, eq(mealSlots.mealId, meals.id))
    .innerJoin(mealTypes, eq(meals.mealTypeId, mealTypes.id))
    .where(eq(mealSlots.id, slotId));
  return row;
}

// A Recipe a slot's picker can offer, with its final Food Categories.
export interface SlotRecipe {
  id: string;
  name: string;
  portions: number;
  categoryIds: string[];
}

// A Product a slot's picker can offer, with its Food Categories.
export interface SlotProduct {
  id: string;
  name: string;
  defaultUnit: DefaultUnit;
  categoryIds: string[];
}

// Every non-Archived Recipe and Product, with the non-Archived Food
// Categories a slot's picker matches against its Slot Category.
export async function listFoodsForSlots(db: Db): Promise<{ recipes: SlotRecipe[]; products: SlotProduct[] }> {
  const [activeRecipes, activeProducts] = await Promise.all([listActiveRecipes(db), listActiveProducts(db)]);
  const categoryIds = await finalCategoryIdsByRecipe(db, activeRecipes.map((recipe) => recipe.id));
  return {
    recipes: activeRecipes.map(({ id, name, portions }) => ({ id, name, portions, categoryIds: categoryIds.get(id)! })),
    products: activeProducts.map(({ id, name, defaultUnit, categoryIds }) => ({ id, name, defaultUnit, categoryIds })),
  };
}

// Nothing if the Meal is Confirmed or Skipped.
export async function setMealUntracked(db: Db, id: string, untracked: boolean): Promise<void> {
  await db.update(meals).set({ untracked }).where(changeable(id));
}

// A hard delete; its own slots cascade. Nothing if the Meal is Confirmed or
// Skipped: it must be Reopened first. A Reopened Meal's Stock Movements stay
// in the Products' history, no longer linked to it.
export async function deleteMeal(db: Db, id: string): Promise<void> {
  await db.delete(meals).where(changeable(id));
}
