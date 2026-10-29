import { beforeAll, describe, expect, it } from "vitest";
import { listActiveCategories } from "./food-categories";
import { listActiveMealTypes } from "./meal-types";
import { createMealTemplate } from "./meal-templates";
import { addMealSlot, createMeal, createMealFromTemplate, fillMealSlot, getMeal, setMealUntracked } from "./meals";
import { createProduct, removeProduct } from "./products";
import { loadStockProjection } from "./projected-stock";
import { createRecipe, removeRecipe } from "./recipes";
import { restockProduct } from "./stock-movements";
import { createTestDb } from "./test-database";

let db: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  db = await createTestDb();
});

async function aProduct(name: string, fields: { defaultUnit: "g" | "ml" | "pc"; density: number | null }) {
  const result = await createProduct(db, { name, ...fields, packSize: null, categoryIds: [] });
  if (!result.ok) throw new Error(`Could not create ${name}: ${result.error}`);
  return result.product;
}

describe("loadStockProjection", () => {
  it("loads every tracked Meal not yet eaten up to the given day, with what its slots need", async () => {
    const lunch = (await listActiveMealTypes(db)).find((mealType) => mealType.seedKey === "lunch")!;
    const slotCategoryId = (await listActiveCategories(db))[0]!.id;
    const rice = await aProduct("Rice", { defaultUnit: "g", density: null });
    const milk = await aProduct("Milk", { defaultUnit: "ml", density: 1.03 });
    await restockProduct(db, rice.id, 500);
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
    const meal = (date: string) => createMeal(db, { date, hour: "12:30", name: null, mealTypeId: lunch.id });

    // Its day has passed: Unconfirmed, still to be eaten as far as Stock knows.
    const unconfirmed = await meal("2026-10-01");
    await addMealSlot(db, unconfirmed.id, {
      slotCategoryId,
      fill: { content: "product", productId: rice.id, quantity: 150 },
    });
    const planned = await meal("2026-11-10");
    await addMealSlot(db, planned.id, {
      slotCategoryId,
      fill: { content: "recipe", recipeId: recipe.id, portions: 2 },
    });
    const eatenOut = await meal("2026-11-10");
    await setMealUntracked(db, eatenOut.id, true);
    const afterRange = await meal("2026-12-01");
    // Both are used by slots, so removing them Archives them: still projected.
    await removeRecipe(db, recipe.id);
    await removeProduct(db, rice.id);

    const { meals, products } = await loadStockProjection(db, "2026-11-30");

    const [unconfirmedSlot] = (await getMeal(db, unconfirmed.id))!.slots;
    const [plannedSlot] = (await getMeal(db, planned.id))!.slots;
    expect(meals.toSorted((a, b) => a.date.localeCompare(b.date))).toEqual([
      {
        id: unconfirmed.id,
        date: "2026-10-01",
        hour: "12:30",
        createdAt: expect.any(Date),
        priority: lunch.priority,
        status: "planned",
        untracked: false,
        slots: [{ id: unconfirmedSlot!.id, content: "product", productId: rice.id, quantity: 150 }],
      },
      {
        id: planned.id,
        date: "2026-11-10",
        hour: "12:30",
        createdAt: expect.any(Date),
        priority: lunch.priority,
        status: "planned",
        untracked: false,
        slots: [
          {
            id: plannedSlot!.id,
            content: "recipe",
            portions: 2,
            recipe: {
              portions: 4,
              ingredients: [
                { productId: rice.id, amount: 200, unit: "g" },
                { productId: milk.id, amount: 1, unit: "cup" },
              ],
            },
          },
        ],
      },
    ]);
    expect(meals.map((m) => m.id)).not.toContain(eatenOut.id);
    expect(meals.map((m) => m.id)).not.toContain(afterRange.id);
    expect(products).toEqual(
      new Map([
        [rice.id, { name: "Rice", defaultUnit: "g", density: null, stock: 500 }],
        [milk.id, { name: "Milk", defaultUnit: "ml", density: 1.03, stock: 0 }],
      ]),
    );
  });

  it("loads empty and Leftovers slots, in their order", async () => {
    const dinner = (await listActiveMealTypes(db)).find((mealType) => mealType.seedKey === "dinner")!;
    const slotCategoryId = (await listActiveCategories(db))[0]!.id;
    const template = await createMealTemplate(db, {
      name: "Two Slots",
      hour: "20:00",
      mealTypeId: dinner.id,
      slotCategoryIds: [slotCategoryId, slotCategoryId],
    });
    const meal = (await createMealFromTemplate(db, { date: "2026-11-20", templateId: template.id }))!;
    const [first, second] = (await getMeal(db, meal.id))!.slots;
    await fillMealSlot(db, first!.id, { content: "leftovers" });

    const { meals } = await loadStockProjection(db, "2026-11-30");

    expect(meals.find((m) => m.id === meal.id)!.slots).toEqual([
      { id: first!.id, content: "leftovers" },
      { id: second!.id, content: "empty" },
    ]);
  });
});
