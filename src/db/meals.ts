import "server-only";
import { and, asc, eq, gt, gte, inArray, lt, lte, max, sql } from "drizzle-orm";
import {
  type MealChanges,
  type MealFormSlot,
  type MealSlotChanges,
  type MealSlotContent,
  type MealSlotFill,
  type MealStatus,
  type NewMealFields,
} from "@/core/meals";
import type { SeriesScope, Weekday } from "@/core/meal-series";
import type { DefaultUnit } from "@/core/units";
import type { FoodCategory } from "./food-categories";
import type { Db } from "./index";
import type { MealType } from "./meal-types";
import { endMealSeries, lockMealSeries, removeEmptyMealSeries, rewriteMealSeries, startMealSeries } from "./meal-series";
import { listActiveProducts } from "./products";
import { finalCategoryIdsByRecipe, listActiveRecipes } from "./recipes";
import { foodCategories, mealSeries, mealSlots, meals, mealTypes, products, recipes } from "./schema";

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
// `repeats` are its Meal Series' days, Monday first; null if it has none.
export interface Meal extends NewMealFields {
  id: string;
  createdAt: Date;
  status: MealStatus;
  untracked: boolean;
  repeats: Weekday[] | null;
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
      repeats: mealSeries.weekdays,
      mealType: {
        seedKey: mealTypes.seedKey,
        name: mealTypes.name,
        allowsLeftovers: mealTypes.allowsLeftovers,
        archived: sql<boolean>`${mealTypes.archivedAt} is not null`,
      },
    })
    .from(meals)
    .innerJoin(mealTypes, eq(meals.mealTypeId, mealTypes.id))
    .leftJoin(mealSeries, eq(meals.seriesId, mealSeries.id));
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
// parseNewMealSlots. If one can't be added, nothing is written. `repeatOn`,
// checked by core's parseRepeatOn, starts a Meal Series from it; none is no
// repeat.
export async function createMeal(
  db: Db,
  fields: Omit<NewMealFields, "untracked"> & Partial<Pick<NewMealFields, "untracked">>,
  slots: readonly MealFormSlot[] = [],
  repeatOn: readonly Weekday[] = [],
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(meals).values(fields).returning({ id: meals.id });
    // One after another, so each goes after the one before.
    for (const slot of slots) await addMealSlot(tx, row!.id, slot);
    if (repeatOn.length > 0) await startMealSeries(tx, row!.id, repeatOn);
    return row!;
  });
}

// The Meal, if it can still change: core's canChangeMeal, checked in the
// write itself so a Meal Confirmed meanwhile is left alone.
const changeable = (id: string) => and(eq(meals.id, id), eq(meals.status, "planned"));

// Its Meal Type never changes. `slots`, Edit Meal's slot changes, must
// already be checked by core's parseMealSlotChanges; they are written with
// the rest, or not at all. `repeatOn`, checked by core's parseRepeatOn,
// starts a Meal Series from the Meal as saved, unless it is already in one.
// For a Meal of a Meal Series, `scope` says whether its hour, name and
// Untracked change on only it, or on the series and it and every later
// Planned Meal of the series too (rewriteMealSeries). False, changing
// nothing, if the Meal is gone, Confirmed or Skipped.
export async function updateMeal(
  db: Db,
  id: string,
  changes: MealChanges,
  slots?: MealSlotChanges,
  repeatOn: readonly Weekday[] = [],
  scope: SeriesScope = "this",
): Promise<boolean> {
  return db.transaction(async (tx) => {
    // The series is held before the Meal, as deleteMeal does, so a save and
    // a delete in one series wait in turn instead of on each other.
    const [found] = await tx.select({ seriesId: meals.seriesId }).from(meals).where(eq(meals.id, id));
    if (found?.seriesId) await lockMealSeries(tx, found.seriesId);
    // Holds the Meal, so its Confirmation, another save, or a slot added or
    // removed elsewhere waits.
    const [meal] = await tx
      .select({ seriesId: meals.seriesId, date: meals.date })
      .from(meals)
      .where(changeable(id))
      .for("update");
    if (!meal) return false;
    if (meal.seriesId !== null && scope === "following") {
      await rewriteMealSeries(tx, { id, seriesId: meal.seriesId, date: meal.date }, changes);
    } else {
      await tx.update(meals).set(changes).where(eq(meals.id, id));
    }
    if (slots) await changeMealSlots(tx, id, slots);
    if (repeatOn.length > 0) await startMealSeries(tx, id, repeatOn);
    return true;
  });
}

// The slots removed, given their new Slot Categories, and renumbered in
// `order` (data-model T5). A slot added since `order` was read goes after
// the others. The unique (meal, position) index is checked row by row, so
// every slot steps aside to a negative position first.
async function changeMealSlots(db: Db, mealId: string, { removed, order, slotCategories }: MealSlotChanges) {
  const ofMeal = (slotId: string) => and(eq(mealSlots.mealId, mealId), eq(mealSlots.id, slotId));
  if (removed.length > 0) {
    await db.delete(mealSlots).where(and(eq(mealSlots.mealId, mealId), inArray(mealSlots.id, removed)));
  }
  for (const { slotId, slotCategoryId } of slotCategories) {
    await db.update(mealSlots).set({ slotCategoryId }).where(ofMeal(slotId));
  }
  const left = await db
    .select({ id: mealSlots.id })
    .from(mealSlots)
    .where(eq(mealSlots.mealId, mealId))
    .orderBy(asc(mealSlots.position));
  const place = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length);
  // A stable sort, so slots added meanwhile keep their own order.
  const ids = left.map((slot) => slot.id).sort((a, b) => place(a) - place(b));
  for (const [index, slotId] of ids.entries()) {
    await db.update(mealSlots).set({ position: -1 - index }).where(ofMeal(slotId));
  }
  for (const [index, slotId] of ids.entries()) {
    await db.update(mealSlots).set({ position: index }).where(ofMeal(slotId));
  }
}

// Holds the Meal until the transaction ends, so changes to its slot
// positions (adding, removing, Edit Meal's Save) wait for each other.
async function lockMeal(db: Db, mealId: string): Promise<void> {
  await db.select({ id: meals.id }).from(meals).where(eq(meals.id, mealId)).for("update");
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
    await lockMeal(tx, mealId);
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
    const [slot] = await tx.select({ mealId: mealSlots.mealId }).from(mealSlots).where(eq(mealSlots.id, slotId));
    if (!slot) return;
    await lockMeal(tx, slot.mealId);
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
// in the Products' history, no longer linked to it. For a Meal of a Meal
// Series, `scope` says whether only it goes, leaving a gap that is never
// recreated, or it and every later Planned Meal of the series, which ends
// it. The series goes once no Meal belongs to it.
export async function deleteMeal(db: Db, id: string, scope: SeriesScope = "this"): Promise<void> {
  await db.transaction(async (tx) => {
    // The series is held before the Meal, as deleting "this and all
    // following" holds the later Meals after it: two deletes in one series
    // then wait in turn instead of on each other.
    const [found] = await tx.select({ seriesId: meals.seriesId }).from(meals).where(eq(meals.id, id));
    if (found?.seriesId) await lockMealSeries(tx, found.seriesId);
    const [meal] = await tx
      .select({ seriesId: meals.seriesId, date: meals.date })
      .from(meals)
      .where(changeable(id))
      .for("update");
    if (!meal) return;
    if (meal.seriesId !== null && scope === "following") {
      await endMealSeries(tx, { id, seriesId: meal.seriesId, date: meal.date });
    } else {
      await tx.delete(meals).where(eq(meals.id, id));
    }
    if (meal.seriesId !== null) await removeEmptyMealSeries(tx, meal.seriesId);
  });
}
