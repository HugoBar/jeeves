import { beforeAll, describe, expect, it } from "vitest";
import type { MealSlotFill } from "@/core/meals";
import { confirmMeal, reopenMeal, skipMeal } from "./confirmation";
import { listActiveCategories } from "./food-categories";
import { listActiveMealTypes } from "./meal-types";
import { createMeal, deleteMeal, getMeal, setMealUntracked, updateMeal } from "./meals";
import { createProduct, getProduct, removeProduct } from "./products";
import { loadStockProjection } from "./projected-stock";
import { createRecipe, removeRecipe } from "./recipes";
import { mealSlots } from "./schema";
import { correctProductStock, discardProductStock, listStockMovements, restockProduct } from "./stock-movements";
import { createTestDb } from "./test-database";

let db: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  db = await createTestDb();
});

const TODAY = "2026-10-28";

// A Product under a name no other test uses, with `stock` in its Default Unit.
async function aProduct(name: string, stock: number, fields: { defaultUnit: "g" | "ml" | "pc"; density: number | null }) {
  const result = await createProduct(db, { name, ...fields, packSize: null, categoryIds: [] });
  if (!result.ok) throw new Error(`Could not create ${name}: ${result.error}`);
  if (stock > 0) await restockProduct(db, result.product.id, stock);
  return result.product;
}

// A Lunch on `date` with the given slots in order, each of the first Food
// Category.
async function aMeal(date: string, fills: MealSlotFill[]) {
  const lunch = (await listActiveMealTypes(db)).find((mealType) => mealType.seedKey === "lunch")!;
  const slotCategoryId = (await listActiveCategories(db))[0]!.id;
  const meal = await createMeal(db, { date, hour: "12:30", name: null, mealTypeId: lunch.id });
  for (const [position, fill] of fills.entries()) {
    await db.insert(mealSlots).values({ mealId: meal.id, slotCategoryId, position, ...fill });
  }
  return meal;
}

// The Product's Stock Movements of one type, oldest first.
async function movements(productId: string, type: "confirmation" | "reopen") {
  return (await listStockMovements(db, productId)).filter((movement) => movement.type === type).reverse();
}

describe("confirmMeal", () => {
  it("writes one Confirmation movement per Product, summed over slots, linked to the Meal", async () => {
    const rice = await aProduct("Rice", 1000, { defaultUnit: "g", density: null });
    const milk = await aProduct("Milk", 1000, { defaultUnit: "ml", density: 1.03 });
    // For 4 Portions; the milk is Minor and in cups.
    const recipe = await createRecipe(db, {
      name: "Rice Pudding",
      portions: 4,
      steps: "Simmer",
      prepTimeMinutes: 40,
      sourceUrl: null,
      ingredients: [
        { productId: rice.id, amount: 200, unit: "g", minor: false },
        { productId: milk.id, amount: 1, unit: "cup", minor: true },
      ],
      categoryOverrides: [],
    });
    const meal = await aMeal("2026-10-27", [
      { content: "recipe", recipeId: recipe.id, portions: 2 },
      { content: "product", productId: rice.id, quantity: 150 },
      { content: "leftovers" },
      { content: "empty" },
    ]);

    expect(await confirmMeal(db, meal.id, { untracked: false, today: TODAY })).toEqual({ ok: true });

    // 200 g x 2/4 + 150 g, and 250 ml x 2/4.
    expect(await movements(rice.id, "confirmation")).toEqual([
      expect.objectContaining({ delta: -250, resultingQuantity: 750, mealId: meal.id }),
    ]);
    expect(await movements(milk.id, "confirmation")).toEqual([
      expect.objectContaining({ delta: -125, resultingQuantity: 875, mealId: meal.id }),
    ]);
    expect(await getProduct(db, rice.id)).toMatchObject({ stock: 750, stockSuspect: false });
    expect(await getMeal(db, meal.id)).toMatchObject({ status: "confirmed", untracked: false });
  });

  it("clamps a deduction past 0 and flags the Stock", async () => {
    const oats = await aProduct("Oats", 100, { defaultUnit: "g", density: null });
    const meal = await aMeal(TODAY, [{ content: "product", productId: oats.id, quantity: 300 }]);

    await confirmMeal(db, meal.id, { untracked: false, today: TODAY });

    expect(await getProduct(db, oats.id)).toMatchObject({ stock: 0, stockSuspect: true });
    expect(await movements(oats.id, "confirmation")).toEqual([
      expect.objectContaining({ delta: -100, resultingQuantity: 0 }),
    ]);
  });

  // A slot keeps them, and they were still eaten.
  it("deducts Archived Recipes and Products a slot keeps", async () => {
    const lentils = await aProduct("Lentils", 500, { defaultUnit: "g", density: null });
    const recipe = await createRecipe(db, {
      name: "Dal",
      portions: 2,
      steps: "Simmer",
      prepTimeMinutes: 30,
      sourceUrl: null,
      ingredients: [{ productId: lentils.id, amount: 200, unit: "g", minor: false }],
      categoryOverrides: [],
    });
    const meal = await aMeal(TODAY, [{ content: "recipe", recipeId: recipe.id, portions: 2 }]);
    await removeRecipe(db, recipe.id);
    await removeProduct(db, lentils.id);

    await confirmMeal(db, meal.id, { untracked: false, today: TODAY });

    expect(await getProduct(db, lentils.id)).toMatchObject({ stock: 300 });
  });

  it("writes nothing when Confirming as Untracked, leaving the Meal Confirmed and Untracked", async () => {
    const bread = await aProduct("Bread", 500, { defaultUnit: "g", density: null });
    const meal = await aMeal(TODAY, [{ content: "product", productId: bread.id, quantity: 100 }]);

    expect(await confirmMeal(db, meal.id, { untracked: true, today: TODAY })).toEqual({ ok: true });

    expect(await movements(bread.id, "confirmation")).toEqual([]);
    expect(await getProduct(db, bread.id)).toMatchObject({ stock: 500 });
    expect(await getMeal(db, meal.id)).toMatchObject({ status: "confirmed", untracked: true });
  });

  it("writes nothing for a Meal already Untracked", async () => {
    const cheese = await aProduct("Cheese", 500, { defaultUnit: "g", density: null });
    const meal = await aMeal(TODAY, [{ content: "product", productId: cheese.id, quantity: 100 }]);
    await setMealUntracked(db, meal.id, true);

    await confirmMeal(db, meal.id, { untracked: false, today: TODAY });

    expect(await getProduct(db, cheese.id)).toMatchObject({ stock: 500 });
    expect(await getMeal(db, meal.id)).toMatchObject({ status: "confirmed", untracked: true });
  });

  it("refuses the whole Confirmation when an Ingredient cannot be converted, writing nothing", async () => {
    const butter = await aProduct("Butter", 500, { defaultUnit: "g", density: null });
    const flour = await aProduct("Flour", 1000, { defaultUnit: "g", density: null });
    const recipe = await createRecipe(db, {
      name: "Shortbread",
      portions: 4,
      steps: "Bake",
      prepTimeMinutes: 45,
      sourceUrl: null,
      ingredients: [
        { productId: butter.id, amount: 100, unit: "g", minor: false },
        { productId: flour.id, amount: 1, unit: "cup", minor: false },
      ],
      categoryOverrides: [],
    });
    const meal = await aMeal(TODAY, [{ content: "recipe", recipeId: recipe.id, portions: 4 }]);

    expect(await confirmMeal(db, meal.id, { untracked: false, today: TODAY })).toEqual({
      ok: false,
      error: "unconvertible",
      product: { name: "Flour", defaultUnit: "g" },
      amount: 1,
      unit: "cup",
      code: "noDensity",
    });
    expect(await movements(butter.id, "confirmation")).toEqual([]);
    expect(await getProduct(db, butter.id)).toMatchObject({ stock: 500 });
    expect(await getMeal(db, meal.id)).toMatchObject({ status: "planned" });
  });

  it("refuses a Meal after today, or one already Confirmed", async () => {
    const tomorrow = await aMeal("2026-10-29", []);
    const confirmed = await aMeal(TODAY, []);
    await confirmMeal(db, confirmed.id, { untracked: false, today: TODAY });

    expect(await confirmMeal(db, tomorrow.id, { untracked: false, today: TODAY })).toEqual({
      ok: false,
      error: "notConfirmable",
    });
    expect(await confirmMeal(db, confirmed.id, { untracked: false, today: TODAY })).toEqual({
      ok: false,
      error: "notConfirmable",
    });
    expect(await getMeal(db, tomorrow.id)).toMatchObject({ status: "planned" });
  });

  it("leaves a Confirmed Meal out of Projected Stock", async () => {
    const meal = await aMeal(TODAY, []);
    await confirmMeal(db, meal.id, { untracked: false, today: TODAY });

    const { meals } = await loadStockProjection(db, "2026-12-31");

    expect(meals.map((projected) => projected.id)).not.toContain(meal.id);
  });

  it("keeps a Confirmed Meal read-only: no edits, Untracked toggle or removal", async () => {
    const meal = await aMeal(TODAY, []);
    await confirmMeal(db, meal.id, { untracked: false, today: TODAY });

    await updateMeal(db, meal.id, { hour: "20:00", name: "Changed" });
    await setMealUntracked(db, meal.id, true);
    await deleteMeal(db, meal.id);

    expect(await getMeal(db, meal.id)).toMatchObject({ hour: "12:30", name: null, untracked: false });
  });
});

describe("skipMeal", () => {
  it("marks the Meal Skipped and writes no Stock Movements", async () => {
    const bagels = await aProduct("Bagels", 4, { defaultUnit: "pc", density: null });
    const meal = await aMeal("2026-10-27", [{ content: "product", productId: bagels.id, quantity: 2 }]);

    expect(await skipMeal(db, meal.id, TODAY)).toBe(true);

    expect(await listStockMovements(db, bagels.id)).toHaveLength(1);
    expect(await getProduct(db, bagels.id)).toMatchObject({ stock: 4 });
    expect(await getMeal(db, meal.id)).toMatchObject({ status: "skipped" });
  });

  it("refuses a Meal after today, or one already Confirmed or Skipped", async () => {
    const tomorrow = await aMeal("2026-10-29", []);
    const confirmed = await aMeal(TODAY, []);
    const skipped = await aMeal(TODAY, []);
    await confirmMeal(db, confirmed.id, { untracked: false, today: TODAY });
    await skipMeal(db, skipped.id, TODAY);

    expect(await skipMeal(db, tomorrow.id, TODAY)).toBe(false);
    expect(await skipMeal(db, confirmed.id, TODAY)).toBe(false);
    expect(await skipMeal(db, skipped.id, TODAY)).toBe(false);
    expect(await getMeal(db, tomorrow.id)).toMatchObject({ status: "planned" });
    expect(await getMeal(db, confirmed.id)).toMatchObject({ status: "confirmed" });
  });

  it("refuses Confirming a Skipped Meal", async () => {
    const meal = await aMeal(TODAY, []);
    await skipMeal(db, meal.id, TODAY);

    expect(await confirmMeal(db, meal.id, { untracked: false, today: TODAY })).toEqual({
      ok: false,
      error: "notConfirmable",
    });
  });

  it("leaves a Skipped Meal out of Projected Stock", async () => {
    const crackers = await aProduct("Crackers", 10, { defaultUnit: "pc", density: null });
    const meal = await aMeal(TODAY, [{ content: "product", productId: crackers.id, quantity: 4 }]);
    await skipMeal(db, meal.id, TODAY);

    const { meals } = await loadStockProjection(db, "2026-12-31");

    expect(meals.map((projected) => projected.id)).not.toContain(meal.id);
    expect(meals.flatMap((projected) => projected.slots)).not.toContainEqual(
      expect.objectContaining({ productId: crackers.id }),
    );
  });

  it("keeps a Skipped Meal read-only: no edits, Untracked toggle or removal", async () => {
    const meal = await aMeal(TODAY, []);
    await skipMeal(db, meal.id, TODAY);

    await updateMeal(db, meal.id, { hour: "20:00", name: "Changed" });
    await setMealUntracked(db, meal.id, true);
    await deleteMeal(db, meal.id);

    expect(await getMeal(db, meal.id)).toMatchObject({ hour: "12:30", name: null, untracked: false });
  });
});

describe("reopenMeal", () => {
  it("adds back exactly what the Confirmation removed, after clamping, linked to the Meal", async () => {
    const pasta = await aProduct("Pasta", 500, { defaultUnit: "g", density: null });
    const eggs = await aProduct("Eggs", 2, { defaultUnit: "pc", density: null });
    const meal = await aMeal("2026-10-20", [
      { content: "product", productId: pasta.id, quantity: 200 },
      { content: "product", productId: eggs.id, quantity: 3 },
    ]);
    await confirmMeal(db, meal.id, { untracked: false, today: TODAY });

    expect(await reopenMeal(db, meal.id)).toBe(true);

    expect(await movements(pasta.id, "reopen")).toEqual([
      expect.objectContaining({ delta: 200, resultingQuantity: 500, mealId: meal.id }),
    ]);
    // 3 were eaten but only 2 were in Stock, so only 2 come back.
    expect(await movements(eggs.id, "reopen")).toEqual([
      expect.objectContaining({ delta: 2, resultingQuantity: 2, mealId: meal.id }),
    ]);
    // Its day has passed: Planned again, so Unconfirmed.
    expect(await getMeal(db, meal.id)).toMatchObject({ status: "planned" });
  });

  it('clears the "stock was probably wrong" flag when its Confirmation set it', async () => {
    const apples = await aProduct("Apples", 0, { defaultUnit: "pc", density: null });
    const meal = await aMeal(TODAY, [{ content: "product", productId: apples.id, quantity: 1 }]);
    await confirmMeal(db, meal.id, { untracked: false, today: TODAY });
    expect(await getProduct(db, apples.id)).toMatchObject({ stockSuspect: true });

    await reopenMeal(db, meal.id);

    expect(await getProduct(db, apples.id)).toMatchObject({ stock: 0, stockSuspect: false });
  });

  // Set for another reason, for the user to look into.
  it("keeps the flag when a clamped Discard also set it", async () => {
    const pears = await aProduct("Pears", 1, { defaultUnit: "pc", density: null });
    const meal = await aMeal(TODAY, [{ content: "product", productId: pears.id, quantity: 2 }]);
    await confirmMeal(db, meal.id, { untracked: false, today: TODAY });
    await discardProductStock(db, pears.id, 1);

    await reopenMeal(db, meal.id);

    expect(await getProduct(db, pears.id)).toMatchObject({ stock: 1, stockSuspect: true });
  });

  it("leaves the flag off when a Correction already cleared it", async () => {
    const plums = await aProduct("Plums", 1, { defaultUnit: "pc", density: null });
    const meal = await aMeal(TODAY, [{ content: "product", productId: plums.id, quantity: 2 }]);
    await confirmMeal(db, meal.id, { untracked: false, today: TODAY });
    await correctProductStock(db, plums.id, 4);

    await reopenMeal(db, meal.id);

    expect(await getProduct(db, plums.id)).toMatchObject({ stock: 5, stockSuspect: false });
  });

  it("reverses only the latest Confirmation after a Meal is Confirmed again", async () => {
    const yoghurt = await aProduct("Yoghurt", 1000, { defaultUnit: "g", density: null });
    const meal = await aMeal(TODAY, [{ content: "product", productId: yoghurt.id, quantity: 150 }]);
    await confirmMeal(db, meal.id, { untracked: false, today: TODAY });
    await reopenMeal(db, meal.id);
    await confirmMeal(db, meal.id, { untracked: false, today: TODAY });

    await reopenMeal(db, meal.id);

    expect(await getProduct(db, yoghurt.id)).toMatchObject({ stock: 1000 });
    expect(await movements(yoghurt.id, "reopen")).toHaveLength(2);
  });

  it("writes nothing for a Confirmed Untracked Meal, which stays Untracked", async () => {
    const jam = await aProduct("Jam", 300, { defaultUnit: "g", density: null });
    const meal = await aMeal(TODAY, [{ content: "product", productId: jam.id, quantity: 50 }]);
    await confirmMeal(db, meal.id, { untracked: true, today: TODAY });

    expect(await reopenMeal(db, meal.id)).toBe(true);

    expect(await listStockMovements(db, jam.id)).toHaveLength(1);
    expect(await getMeal(db, meal.id)).toMatchObject({ status: "planned", untracked: true });
  });

  it("returns a Skipped Meal to Planned with no Stock change", async () => {
    const muffins = await aProduct("Muffins", 6, { defaultUnit: "pc", density: null });
    const meal = await aMeal("2026-10-27", [{ content: "product", productId: muffins.id, quantity: 2 }]);
    await skipMeal(db, meal.id, TODAY);

    expect(await reopenMeal(db, meal.id)).toBe(true);

    expect(await listStockMovements(db, muffins.id)).toHaveLength(1);
    expect(await getProduct(db, muffins.id)).toMatchObject({ stock: 6 });
    // Its day has passed: Planned again, so Unconfirmed.
    expect(await getMeal(db, meal.id)).toMatchObject({ status: "planned" });
  });

  // A Confirmation already Reopened is not reversed twice.
  it("writes nothing for a Meal Skipped after a Confirmation was Reopened", async () => {
    const scones = await aProduct("Scones", 6, { defaultUnit: "pc", density: null });
    const meal = await aMeal(TODAY, [{ content: "product", productId: scones.id, quantity: 2 }]);
    await confirmMeal(db, meal.id, { untracked: false, today: TODAY });
    await reopenMeal(db, meal.id);
    await skipMeal(db, meal.id, TODAY);

    await reopenMeal(db, meal.id);

    expect(await movements(scones.id, "reopen")).toHaveLength(1);
    expect(await getProduct(db, scones.id)).toMatchObject({ stock: 6 });
  });

  it("refuses a Meal that is not Confirmed or Skipped", async () => {
    const meal = await aMeal(TODAY, []);
    expect(await reopenMeal(db, meal.id)).toBe(false);
  });
});

describe("deleteMeal after a Reopen", () => {
  it("removes the Meal and keeps its Stock Movements, with no Meal link", async () => {
    const honey = await aProduct("Honey", 400, { defaultUnit: "g", density: null });
    const meal = await aMeal(TODAY, [{ content: "product", productId: honey.id, quantity: 20 }]);
    await confirmMeal(db, meal.id, { untracked: false, today: TODAY });
    await reopenMeal(db, meal.id);

    await deleteMeal(db, meal.id);

    expect(await getMeal(db, meal.id)).toBeUndefined();
    const history = await listStockMovements(db, honey.id);
    expect(history.map(({ type, mealId }) => ({ type, mealId }))).toEqual(
      expect.arrayContaining([
        { type: "confirmation", mealId: null },
        { type: "reopen", mealId: null },
      ]),
    );
    expect(await getProduct(db, honey.id)).toMatchObject({ stock: 400 });
  });
});
