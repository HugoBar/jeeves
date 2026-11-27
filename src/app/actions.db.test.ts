import { beforeAll, describe, expect, it, vi } from "vitest";
import { MalformedRequest } from "@/core/request";
import { createTestDb, type TestDb } from "@/db/test-database";
import * as categories from "./categories/actions";
import { isDatabaseReachable } from "./database-status";
import * as mealTemplates from "./meal-templates/actions";
import * as mealTypes from "./meal-types/actions";
import * as planner from "./planner/actions";
import * as products from "./products/actions";
import * as stock from "./products/stock-actions";
import * as recipes from "./recipes/actions";
import * as shoppingList from "./shopping-list/actions";

// The server actions run against this test's database.
const testDb = vi.hoisted(() => ({ current: undefined as TestDb | undefined }));
vi.mock("@/db", () => ({ getDb: () => testDb.current }));
vi.mock("next/cache", () => ({ refresh: () => {} }));
// A malformed request never gets as far as leaving the page.
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirected");
  },
}));

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
  testDb.current = db;
});

// A well-formed id of nothing, a malformed one, and a date.
const ID = "3f2c8a9e-1b7d-4c5e-9a0f-2d6b8e4c1a7f";
const BAD_ID = "not-an-id";
const TODAY = "2026-11-12";
const RANGE = { from: "2026-11-12", to: "2026-11-15" };
// What a crafted form can send in place of text.
const FILE = new File(["x"], "x.txt");

// A form sending `fields`; a list sends each of its values under the name.
function form(fields: Record<string, string | File | (string | File)[]> = {}): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) formData.append(name, item);
  }
  return formData;
}

// A form action's previous state, which no action reads.
const STATE = {} as never;
// An argument of the wrong type, as a crafted request can send it.
const crafted = (value: unknown) => value as never;

// What each check names when it refuses: "Malformed request: expected an id".
const AN_ID = "an id";
const A_DATE = "a date";
const A_LIST = "a list";
const AN_OBJECT = "an object";
const TEXT = "text";
const TRUE_OR_FALSE = "true or false";

type Case = [action: string, what: string, expected: string, call: () => Promise<unknown>];

const CASES: Case[] = [
  ["createCategoryAction", "a file for the name", TEXT, () => categories.createCategoryAction(STATE, form({ name: FILE, kind: "role" }))],
  ["createCategoryAction", "a Kind the form doesn't offer", "one of role, kind", () => categories.createCategoryAction(STATE, form({ name: "Crafted", kind: "other" }))],
  ["editCategoryAction", "a malformed id", AN_ID, () => categories.editCategoryAction(BAD_ID, STATE, form({ name: "Crafted", kind: "role" }))],
  ["removeCategoryAction", "a malformed id", AN_ID, () => categories.removeCategoryAction(BAD_ID)],

  ["createMealTypeAction", "a file for the name", TEXT, () => mealTypes.createMealTypeAction(STATE, form({ name: FILE, priority: "1" }))],
  ["editMealTypeAction", "a malformed id", AN_ID, () => mealTypes.editMealTypeAction(BAD_ID, STATE, form({ name: "Crafted", priority: "1" }))],
  ["removeMealTypeAction", "a malformed id", AN_ID, () => mealTypes.removeMealTypeAction(BAD_ID)],

  ["createMealTemplateAction", "a malformed Meal Type id", AN_ID, () => mealTemplates.createMealTemplateAction(STATE, form({ name: "Crafted", hour: "12:00", mealTypeId: BAD_ID }))],
  ["createMealTemplateAction", "a malformed Slot Category id", AN_ID, () => mealTemplates.createMealTemplateAction(STATE, form({ name: "Crafted", hour: "12:00", mealTypeId: ID, slotCategoryId: [ID, BAD_ID] }))],
  ["editMealTemplateAction", "a malformed id", AN_ID, () => mealTemplates.editMealTemplateAction(BAD_ID, STATE, form({ name: "Crafted", hour: "12:00" }))],
  ["removeMealTemplateAction", "a malformed id", AN_ID, () => mealTemplates.removeMealTemplateAction(BAD_ID)],

  ["createMealAction", "a date that isn't text", TEXT, () => planner.createMealAction(crafted(20261112), STATE, form({ hour: "12:00", mealTypeId: ID, today: TODAY }))],
  ["createMealAction", "a malformed date for today", A_DATE, () => planner.createMealAction(TODAY, STATE, form({ name: "Crafted", hour: "12:00", mealTypeId: ID, today: "2026-02-30" }))],
  ["createMealAction", "a malformed Meal Type id", AN_ID, () => planner.createMealAction(TODAY, STATE, form({ hour: "12:00", mealTypeId: BAD_ID, today: TODAY }))],
  ["createMealAction", "a malformed slot's Slot Category id", AN_ID, () => planner.createMealAction(TODAY, STATE, form({ hour: "12:00", mealTypeId: ID, today: TODAY, slotFood: "x", slotAmount: "1", slotCategoryId: BAD_ID }))],
  ["editMealAction", "a malformed id", AN_ID, () => planner.editMealAction(BAD_ID, STATE, form({ hour: "12:00", today: TODAY }))],
  ["editMealAction", "a malformed date for today", A_DATE, () => planner.editMealAction(ID, STATE, form({ hour: "12:00", today: "12/11/2026" }))],
  ["editMealAction", "a malformed removed slot id", AN_ID, () => planner.editMealAction(ID, STATE, form({ hour: "12:00", today: TODAY, removedSlotId: BAD_ID }))],
  ["editMealAction", "a malformed changed slot id", AN_ID, () => planner.editMealAction(ID, STATE, form({ hour: "12:00", today: TODAY, slotOrder: ID, changedSlotId: BAD_ID, changedSlotCategoryId: ID }))],
  ["editMealAction", "a malformed changed slot's Slot Category id", AN_ID, () => planner.editMealAction(ID, STATE, form({ hour: "12:00", today: TODAY, slotOrder: ID, changedSlotId: ID, changedSlotCategoryId: BAD_ID }))],
  ["editMealAction", "a malformed added slot's Slot Category id", AN_ID, () => planner.editMealAction(ID, STATE, form({ hour: "12:00", today: TODAY, slotOrder: "new-1", addedSlotKey: "new-1", addedSlotFood: "x", addedSlotAmount: "1", addedSlotCategoryId: BAD_ID }))],
  ["setMealSlotCategoryAction", "a malformed slot id", AN_ID, () => planner.setMealSlotCategoryAction(BAD_ID, STATE, form({ slotCategoryId: ID }))],
  ["setMealSlotCategoryAction", "a malformed Slot Category id", AN_ID, () => planner.setMealSlotCategoryAction(ID, STATE, form({ slotCategoryId: BAD_ID }))],
  ["fillMealSlotAction", "a malformed slot id", AN_ID, () => planner.fillMealSlotAction(BAD_ID, STATE, form({ food: "x", amount: "1" }))],
  ["fillMealSlotAction", "a malformed Slot Category id from Edit Meal", AN_ID, () => planner.fillMealSlotAction(ID, STATE, form({ food: "x", amount: "1", slotCategoryId: BAD_ID }))],
  ["fillMealSlotAction", "a file for the food", TEXT, () => planner.fillMealSlotAction(ID, STATE, form({ food: FILE, amount: "1" }))],
  ["fillEmptySlotsAction", "a malformed slot id", AN_ID, () => planner.fillEmptySlotsAction([ID, BAD_ID], TODAY)],
  ["fillEmptySlotsAction", "no list of slots", A_LIST, () => planner.fillEmptySlotsAction(crafted(ID), TODAY)],
  ["fillEmptySlotsAction", "a malformed date", A_DATE, () => planner.fillEmptySlotsAction([ID], crafted(20261112))],
  ["undoFillAction", "no list of fills", A_LIST, () => planner.undoFillAction(crafted({ slotId: ID }))],
  ["undoFillAction", "an item that isn't a record", AN_OBJECT, () => planner.undoFillAction(crafted([null]))],
  ["undoFillAction", "a fill that isn't a record", AN_OBJECT, () => planner.undoFillAction(crafted([{ slotId: ID, fill: null }]))],
  ["undoFillAction", "a malformed slot id", AN_ID, () => planner.undoFillAction([{ slotId: BAD_ID, fill: { content: "recipe", recipeId: ID, portions: 1 } }])],
  ["undoFillAction", "a malformed Recipe id", AN_ID, () => planner.undoFillAction([{ slotId: ID, fill: { content: "recipe", recipeId: BAD_ID, portions: 1 } }])],
  ["undoFillAction", "part Portions", "a whole number", () => planner.undoFillAction([{ slotId: ID, fill: { content: "recipe", recipeId: ID, portions: 1.5 } }])],
  ["undoFillAction", "a malformed Product id", AN_ID, () => planner.undoFillAction([{ slotId: ID, fill: { content: "product", productId: BAD_ID, quantity: 1 } }])],
  ["undoFillAction", "a quantity below 0", "a number", () => planner.undoFillAction([{ slotId: ID, fill: { content: "product", productId: ID, quantity: -1 } }])],
  ["undoFillAction", "a fill that is neither Recipe nor Product", "one of recipe, product", () => planner.undoFillAction(crafted([{ slotId: ID, fill: { content: "leftovers" } }]))],
  ["addMealSlotAction", "a malformed Meal id", AN_ID, () => planner.addMealSlotAction(BAD_ID, STATE, form({ food: "x", amount: "1" }))],
  ["addMealSlotAction", "a malformed Slot Category id", AN_ID, () => planner.addMealSlotAction(ID, STATE, form({ food: "x", amount: "1", slotCategoryId: BAD_ID }))],
  ["removeMealSlotAction", "a malformed slot id", AN_ID, () => planner.removeMealSlotAction(BAD_ID)],
  ["emptyMealSlotAction", "a malformed slot id", AN_ID, () => planner.emptyMealSlotAction(BAD_ID)],
  ["createDueRepeatsAction", "a malformed date", A_DATE, () => planner.createDueRepeatsAction("2026-13-01")],
  ["confirmMealAction", "a malformed Meal id", AN_ID, () => planner.confirmMealAction(BAD_ID, false, TODAY)],
  ["confirmMealAction", "Untracked that isn't true or false", TRUE_OR_FALSE, () => planner.confirmMealAction(ID, crafted("false"), TODAY)],
  ["confirmMealAction", "a malformed date", A_DATE, () => planner.confirmMealAction(ID, false, "today")],
  ["confirmMealsAsPlannedAction", "no list of Meals", A_LIST, () => planner.confirmMealsAsPlannedAction(crafted(ID), TODAY)],
  ["confirmMealsAsPlannedAction", "a malformed Meal id", AN_ID, () => planner.confirmMealsAsPlannedAction([ID, BAD_ID], TODAY)],
  ["confirmMealsAsPlannedAction", "a malformed date", A_DATE, () => planner.confirmMealsAsPlannedAction([ID], "")],
  ["skipMealAction", "a malformed Meal id", AN_ID, () => planner.skipMealAction(BAD_ID, TODAY)],
  ["skipMealAction", "a malformed date", A_DATE, () => planner.skipMealAction(ID, "2026-11-31")],
  ["reopenMealAction", "a malformed Meal id", AN_ID, () => planner.reopenMealAction(BAD_ID)],
  ["removeMealAction", "a malformed Meal id", AN_ID, () => planner.removeMealAction(BAD_ID, "this")],
  ["removeMealAction", "a scope the form doesn't offer", "one of this, following", () => planner.removeMealAction(ID, crafted("all"))],

  ["createProductAction", "a Default Unit the form doesn't offer", "a Default Unit", () => products.createProductAction(STATE, form({ name: "Crafted", defaultUnit: "stone" }))],
  ["createProductAction", "a malformed Food Category id", AN_ID, () => products.createProductAction(STATE, form({ name: "Crafted", defaultUnit: "g", categoryIds: BAD_ID }))],
  ["editProductAction", "a malformed id", AN_ID, () => products.editProductAction(BAD_ID, "stock", STATE, form({ name: "Crafted" }))],
  ["removeProductAction", "a malformed id", AN_ID, () => products.removeProductAction(BAD_ID, "deleted", "stock")],
  ["removeProductAction", "an outcome the page doesn't offer", "one of deleted, archived", () => products.removeProductAction(ID, crafted("gone"), "stock")],

  ["restockAction", "a malformed Product id", AN_ID, () => stock.restockAction(BAD_ID, "1")],
  ["restockAction", "an amount that isn't text", TEXT, () => stock.restockAction(ID, crafted(1))],
  ["discardAction", "a malformed Product id", AN_ID, () => stock.discardAction(BAD_ID, "1")],
  ["correctAction", "a malformed Product id", AN_ID, () => stock.correctAction(BAD_ID, "1")],

  ["createRecipeAction", "a file for the name", TEXT, () => recipes.createRecipeAction(STATE, form({ name: FILE }))],
  ["createRecipeAction", "a malformed Ingredient Product id", AN_ID, () => recipes.createRecipeAction(STATE, form({ name: "Crafted", ingredientProductId: BAD_ID }))],
  ["createRecipeAction", "a malformed Override's Food Category id", AN_ID, () => recipes.createRecipeAction(STATE, form({ name: "Crafted", overrideCategoryId: BAD_ID }))],
  ["editRecipeAction", "a malformed id", AN_ID, () => recipes.editRecipeAction(BAD_ID, STATE, form({ name: "Crafted" }))],
  ["removeRecipeAction", "a malformed id", AN_ID, () => recipes.removeRecipeAction(BAD_ID, "deleted")],
  ["removeRecipeAction", "an outcome the page doesn't offer", "one of deleted, archived", () => recipes.removeRecipeAction(ID, crafted("gone"))],

  ["generateShoppingListAction", "a malformed date for today", A_DATE, () => shoppingList.generateShoppingListAction("2026-11", RANGE)],
  ["generateShoppingListAction", "dates that aren't a record", AN_OBJECT, () => shoppingList.generateShoppingListAction(TODAY, crafted([RANGE.from, RANGE.to]))],
  ["generateShoppingListAction", "a malformed From date", A_DATE, () => shoppingList.generateShoppingListAction(TODAY, { ...RANGE, from: "soon" })],
  ["generateShoppingListAction", "a malformed To date", A_DATE, () => shoppingList.generateShoppingListAction(TODAY, { ...RANGE, to: "later" })],
  ["generateShoppingListAction", "From after To", "dates Generate can use", () => shoppingList.generateShoppingListAction(TODAY, { from: RANGE.to, to: RANGE.from })],
  ["generateShoppingListAction", "dates outside the Planner's two weeks", "dates Generate can use", () => shoppingList.generateShoppingListAction(TODAY, { from: TODAY, to: "2026-12-31" })],
  ["removeShoppingListItemAction", "a malformed id", AN_ID, () => shoppingList.removeShoppingListItemAction(BAD_ID)],
  ["addProductByHandAction", "a malformed Product id", AN_ID, () => shoppingList.addProductByHandAction(BAD_ID)],
  ["setShoppingListItemTickedAction", "a malformed id", AN_ID, () => shoppingList.setShoppingListItemTickedAction(BAD_ID, true)],
  ["setShoppingListItemTickedAction", "ticked that isn't true or false", TRUE_OR_FALSE, () => shoppingList.setShoppingListItemTickedAction(ID, crafted("on"))],
  ["setShoppingListItemAmountAction", "a malformed id", AN_ID, () => shoppingList.setShoppingListItemAmountAction(BAD_ID, "1")],
  ["setShoppingListItemAmountAction", "an amount that isn't text", TEXT, () => shoppingList.setShoppingListItemAmountAction(ID, crafted(1))],
  ["setAllShoppingListItemsTickedAction", "ticked that isn't true or false", TRUE_OR_FALSE, () => shoppingList.setAllShoppingListItemsTickedAction(crafted(1))],
  ["restockTickedItemsAction", "no list of items bought", A_LIST, () => shoppingList.restockTickedItemsAction(crafted({ id: ID, amount: "1" }))],
  ["restockTickedItemsAction", "an item bought that isn't a record", AN_OBJECT, () => shoppingList.restockTickedItemsAction(crafted(["1"]))],
  ["restockTickedItemsAction", "a malformed item id", AN_ID, () => shoppingList.restockTickedItemsAction([{ id: BAD_ID, amount: "1" }])],

  // A file in each field a form sends as text, every other field well formed.
  ["editCategoryAction", "a file for the name", TEXT, () => categories.editCategoryAction(ID, STATE, form({ name: FILE, kind: "role" }))],
  ["createMealTypeAction", "a file for the Meal Priority", TEXT, () => mealTypes.createMealTypeAction(STATE, form({ name: "Crafted", priority: FILE }))],
  ["editMealTypeAction", "a file for the name", TEXT, () => mealTypes.editMealTypeAction(ID, STATE, form({ name: FILE, priority: "1" }))],
  ["createMealTemplateAction", "a file for the name", TEXT, () => mealTemplates.createMealTemplateAction(STATE, form({ name: FILE, hour: "12:00", mealTypeId: ID }))],
  ["createMealTemplateAction", "a file for the hour", TEXT, () => mealTemplates.createMealTemplateAction(STATE, form({ name: "Crafted", hour: FILE, mealTypeId: ID }))],
  ["createMealTemplateAction", "a file for the Meal Type", TEXT, () => mealTemplates.createMealTemplateAction(STATE, form({ name: "Crafted", hour: "12:00", mealTypeId: FILE }))],
  ...(["hour", "name", "repeatOn", "slotFood", "slotAmount", "mealTypeId"] as const).map(
    (field): Case => ["createMealAction", `a file for ${field}`, TEXT, () => planner.createMealAction(TODAY, STATE, form({ hour: "12:00", mealTypeId: ID, today: TODAY, slotFood: "x", slotAmount: "1", slotCategoryId: "", [field]: FILE }))],
  ),
  ...(["hour", "name", "repeatOn", "seriesScope"] as const).map(
    (field): Case => ["editMealAction", `a file for ${field}`, TEXT, () => planner.editMealAction(ID, STATE, form({ hour: "12:00", today: TODAY, [field]: FILE }))],
  ),
  ...(["slotOrder", "addedSlotKey", "addedSlotFood", "addedSlotAmount"] as const).map(
    (field): Case => ["editMealAction", `a file for ${field}`, TEXT, () => planner.editMealAction(ID, STATE, form({ hour: "12:00", today: TODAY, slotOrder: "new-1", addedSlotKey: "new-1", addedSlotFood: "x", addedSlotAmount: "1", addedSlotCategoryId: "", [field]: FILE }))],
  ),
  ["setMealSlotCategoryAction", "a file for the Slot Category", TEXT, () => planner.setMealSlotCategoryAction(ID, STATE, form({ slotCategoryId: FILE }))],
  ["fillMealSlotAction", "a file for the amount", TEXT, () => planner.fillMealSlotAction(ID, STATE, form({ food: "x", amount: FILE }))],
  ["addMealSlotAction", "a file for the food", TEXT, () => planner.addMealSlotAction(ID, STATE, form({ food: FILE, amount: "1" }))],
  ["addMealSlotAction", "a file for the amount", TEXT, () => planner.addMealSlotAction(ID, STATE, form({ food: "x", amount: FILE }))],
  ...(["name", "density", "packSizeName", "packSizeAmount", "defaultUnit"] as const).map(
    (field): Case => ["createProductAction", `a file for ${field}`, TEXT, () => products.createProductAction(STATE, form({ name: "Crafted", defaultUnit: "g", [field]: FILE }))],
  ),
  ["editProductAction", "a file for the name", TEXT, () => products.editProductAction(ID, "stock", STATE, form({ name: FILE, defaultUnit: "g" }))],
  ["discardAction", "an amount that isn't text", TEXT, () => stock.discardAction(ID, crafted(1))],
  ["correctAction", "an amount that isn't text", TEXT, () => stock.correctAction(ID, crafted(1))],
  ...(["portions", "steps", "prepTimeMinutes", "sourceUrl", "ingredientAmount", "ingredientUnit", "ingredientMinor", "overrideMode"] as const).map(
    (field): Case => ["createRecipeAction", `a file for ${field}`, TEXT, () => recipes.createRecipeAction(STATE, form({ name: "Crafted", ingredientProductId: ID, overrideCategoryId: ID, [field]: FILE }))],
  ),
  ["editRecipeAction", "a file for the name", TEXT, () => recipes.editRecipeAction(ID, STATE, form({ name: FILE }))],
  ["restockTickedItemsAction", "an amount that isn't text", TEXT, () => shoppingList.restockTickedItemsAction(crafted([{ id: ID, amount: 1 }]))],
];

// Every row of every table, so a test sees any write at all.
async function everyRow(): Promise<string> {
  const { rows } = await db.$client.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
  );
  const tables = await Promise.all(
    rows.map(async ({ tablename }) => {
      const result = await db.$client.query(`SELECT * FROM public."${tablename}"`);
      return [tablename, result.rows.map((row) => JSON.stringify(row)).sort()];
    }),
  );
  return JSON.stringify(tables);
}

describe("a server action sent a malformed request", () => {
  it.each(CASES)("%s refuses %s, writing nothing", async (_, __, expected, call) => {
    const before = await everyRow();
    // The message names the check, so a case refused by another check fails.
    const refusal = call();
    await expect(refusal).rejects.toThrow(MalformedRequest);
    await expect(refusal).rejects.toThrow(`Malformed request: expected ${expected}`);
    expect(await everyRow()).toBe(before);
  });

  it("is tried for every exported action that takes anything", () => {
    const modules = [categories, mealTemplates, mealTypes, planner, products, stock, recipes, shoppingList];
    const exported = modules.flatMap((module) => Object.keys(module)).sort();
    expect([...new Set(CASES.map(([action]) => action))].sort()).toEqual(exported);
  });
});

// The one action that takes nothing, so nothing can be malformed.
describe("isDatabaseReachable", () => {
  it("says yes when the database answers", async () => {
    expect(await isDatabaseReachable()).toBe(true);
  });

  it("says no, and logs why, when it doesn't", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    testDb.current = { execute: () => Promise.reject(new Error("Connection refused")) } as never;
    try {
      expect(await isDatabaseReachable()).toBe(false);
      expect(logged).toHaveBeenCalledWith("Database check failed:", expect.any(Error));
    } finally {
      testDb.current = db;
      logged.mockRestore();
    }
  });
});
