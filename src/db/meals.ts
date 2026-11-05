import "server-only";
import { and, asc, desc, eq, gt, gte, inArray, lt, lte, max, sql } from "drizzle-orm";
import {
  type MealChanges,
  type MealFormSlot,
  type MealSlotContent,
  type MealSlotFill,
  type MealStatus,
  type NewMealFields,
} from "@/core/meals";
import type { SlotMove } from "@/core/slot-order";
import type { DefaultUnit } from "@/core/units";
import type { FoodCategory } from "./food-categories";
import type { Db } from "./index";
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

// Every Meal stored as "planned" dated before `before`, in no order: the
// Unconfirmed Meals of any viewer whose date is `before` or earlier (spec
// "Platform").
export async function listPlannedMealsBefore(db: Db, before: string): Promise<Meal[]> {
  return toMeals(db, await selectMeals(db).where(and(eq(meals.status, "planned"), lt(meals.date, before))));
}

export async function getMeal(db: Db, id: string): Promise<Meal | undefined> {
  const [meal] = await toMeals(db, await selectMeals(db).where(eq(meals.id, id)));
  return meal;
}

// A new Meal: Planned, and tracked unless `untracked` says otherwise.
// `slots`, the ones on the Meal form, are added in order by addMealSlot: added
// by hand, or copied empty from a Meal Template, which the Meal keeps no link
// to (data-model Q5). Each must already be checked by core's
// parseNewMealSlots. If one can't be added, nothing is written.
export async function createMeal(
  db: Db,
  fields: Omit<NewMealFields, "untracked"> & Partial<Pick<NewMealFields, "untracked">>,
  slots: readonly MealFormSlot[] = [],
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(meals).values(fields).returning({ id: meals.id });
    // One after another, so each goes after the one before.
    for (const slot of slots) await addMealSlot(tx, row!.id, slot);
    return row!;
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

// A slot after the Meal's others. It must already be checked by core's
// parseNewMealSlot, or parseNewMealSlots on the Meal form.
export async function addMealSlot(db: Db, mealId: string, { slotCategoryId, fill }: MealFormSlot): Promise<void> {
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

// The slot swapped with the one just above it (`move` -1) or below it (1),
// renumbering the two (data-model T5). The unique (meal, position) index is
// checked row by row, so the slot steps aside to -1 first. False, moving
// nothing, if the slot is gone, already first or last, or its Meal is
// Confirmed or Skipped.
export async function moveMealSlot(db: Db, slotId: string, move: SlotMove): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [slot] = await tx
      .select({ mealId: mealSlots.mealId, position: mealSlots.position })
      .from(mealSlots)
      .innerJoin(meals, eq(mealSlots.mealId, meals.id))
      .where(and(eq(mealSlots.id, slotId), eq(meals.status, "planned")))
      // Holds the Meal, so another move on it or its Confirmation waits.
      .for("update", { of: meals });
    if (!slot) return false;
    const [neighbour] = await tx
      .select({ id: mealSlots.id, position: mealSlots.position })
      .from(mealSlots)
      .where(
        and(
          eq(mealSlots.mealId, slot.mealId),
          move < 0 ? lt(mealSlots.position, slot.position) : gt(mealSlots.position, slot.position),
        ),
      )
      .orderBy(move < 0 ? desc(mealSlots.position) : asc(mealSlots.position))
      .limit(1);
    if (!neighbour) return false;
    await tx.update(mealSlots).set({ position: -1 }).where(eq(mealSlots.id, slotId));
    await tx.update(mealSlots).set({ position: slot.position }).where(eq(mealSlots.id, neighbour.id));
    await tx.update(mealSlots).set({ position: neighbour.position }).where(eq(mealSlots.id, slotId));
    return true;
  });
}

// The Slot Category must already be checked by core's parseMealSlotCategory.
// What the slot holds stays, even food that does not carry the new one: only
// what fills it from now on must.
export async function setMealSlotCategory(db: Db, slotId: string, slotCategoryId: string): Promise<void> {
  await db.update(mealSlots).set({ slotCategoryId }).where(eq(mealSlots.id, slotId));
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

// A hard delete; its own slots cascade. Nothing if the Meal is Confirmed or
// Skipped: it must be Reopened first. A Reopened Meal's Stock Movements stay
// in the Products' history, no longer linked to it.
export async function deleteMeal(db: Db, id: string): Promise<void> {
  await db.delete(meals).where(changeable(id));
}
