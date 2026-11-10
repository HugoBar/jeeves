import { beforeEach, describe, expect, it } from "vitest";
import type { NewMealSlot } from "@/core/meals";
import { listActiveCategories } from "./food-categories";
import { listActiveMealTypes } from "./meal-types";
import { createMeal } from "./meals";
import { createProduct } from "./products";
import { createRecipe } from "./recipes";
import { shoppingListItems } from "./schema";
import { generateShoppingList, listShoppingList } from "./shopping-list";
import { restockProduct } from "./stock-movements";
import { createTestDb } from "./test-database";

// What a slot of a test Meal holds.
type SlotFill = NewMealSlot["fill"];

// Generate works over the whole list, so each test starts from an empty one.
let db: Awaited<ReturnType<typeof createTestDb>>;

beforeEach(async () => {
  db = await createTestDb();
});

// The Planner's week of Wednesday 11 Nov 2026.
const WEEK = { from: "2026-11-09", to: "2026-11-15" };

async function aProduct(name: string, stock = 0) {
  const result = await createProduct(db, { name, defaultUnit: "g", density: null, packSize: null, categoryIds: [] });
  if (!result.ok) throw new Error(`Could not create ${name}: ${result.error}`);
  if (stock > 0) await restockProduct(db, result.product.id, stock);
  return result.product;
}

// A Lunch on `date` with a slot for each fill.
async function aMeal(date: string, ...fills: SlotFill[]) {
  const lunch = (await listActiveMealTypes(db)).find((mealType) => mealType.seedKey === "lunch")!;
  const slotCategoryId = (await listActiveCategories(db))[0]!.id;
  await createMeal(
    db,
    { date, hour: "12:30", name: null, mealTypeId: lunch.id },
    fills.map((fill) => ({ slotCategoryId, fill })),
  );
}

// A slot eating `quantity` of a Product.
const eats = (productId: string, quantity: number): SlotFill => ({ content: "product", productId, quantity });

// The list by name, a Product's ticked item first.
const summary = async () =>
  (await listShoppingList(db))
    .map(({ product, quantity, source, ticked }) => ({ name: product.name, quantity, source, ticked }))
    .sort((a, b) => a.name.localeCompare(b.name) || Number(b.ticked) - Number(a.ticked));

describe("generateShoppingList", () => {
  it("adds the week's Shortfalls, one item per Product, after earlier Meals take Stock", async () => {
    const spinach = await aProduct("Spinach", 100);
    // Before the week and never Confirmed: it still takes 80 g first.
    await aMeal("2026-11-05", eats(spinach.id, 80));
    await aMeal("2026-11-10", eats(spinach.id, 150));
    await aMeal("2026-11-12", eats(spinach.id, 120));
    // After the week.
    await aMeal("2026-11-16", eats(spinach.id, 500));

    await generateShoppingList(db, WEEK.from, WEEK.to);

    expect(await summary()).toEqual([{ name: "Spinach", quantity: 250, source: "shortfall", ticked: false }]);
  });

  it("leaves out a Product whose need can't be worked out in any of the week's Meals", async () => {
    // In grams with no Density, so a cup of it can't be converted.
    const rice = await aProduct("Rice");
    const eggs = await aProduct("Eggs");
    const recipe = await createRecipe(db, {
      name: "Fried Rice",
      portions: 2,
      steps: "Fry",
      prepTimeMinutes: 20,
      sourceUrl: null,
      ingredients: [
        { productId: rice.id, amount: 1, unit: "cup", minor: false },
        { productId: eggs.id, amount: 100, unit: "g", minor: false },
      ],
      categoryOverrides: [],
    });
    await aMeal("2026-11-11", { content: "recipe", recipeId: recipe.id, portions: 2 });
    // Short here too, but part of what Rice needs this week is unknown.
    await aMeal("2026-11-13", eats(rice.id, 200));

    await generateShoppingList(db, WEEK.from, WEEK.to);

    expect(await summary()).toEqual([{ name: "Eggs", quantity: 100, source: "shortfall", ticked: false }]);
  });

  it("tops up what is on the list and keeps ticked and hand-added items", async () => {
    const spinach = await aProduct("Spinach");
    const salt = await aProduct("Salt");
    const oats = await aProduct("Oats");
    await aMeal("2026-11-10", eats(spinach.id, 250), eats(oats.id, 250));
    await db.insert(shoppingListItems).values([
      { productId: spinach.id, quantity: 100, source: "shortfall", ticked: true },
      { productId: oats.id, quantity: null, source: "manual" },
      { productId: salt.id, quantity: null, source: "manual" },
    ]);

    await generateShoppingList(db, WEEK.from, WEEK.to);
    const once = await summary();
    await generateShoppingList(db, WEEK.from, WEEK.to);

    expect(once).toEqual([
      { name: "Oats", quantity: 250, source: "manual", ticked: false },
      { name: "Salt", quantity: null, source: "manual", ticked: false },
      { name: "Spinach", quantity: 100, source: "shortfall", ticked: true },
      { name: "Spinach", quantity: 150, source: "shortfall", ticked: false },
    ]);
    expect(await summary()).toEqual(once);
  });
});
