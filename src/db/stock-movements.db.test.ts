import { beforeAll, describe, expect, it } from "vitest";
import { confirmMeal, reopenMeal } from "./confirmation";
import { listActiveCategories } from "./food-categories";
import { listActiveMealTypes } from "./meal-types";
import { createMeal, deleteMeal } from "./meals";
import { createProduct, getProduct } from "./products";
import { mealSlots, stockMovements } from "./schema";
import { correctProductStock, discardProductStock, listStockMovements, restockProduct } from "./stock-movements";
import { createTestDb } from "./test-database";

let db: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  db = await createTestDb();
});

const TODAY = "2026-10-28";

// A Dinner on `date` with one slot taking 100 of the Product.
async function aDinner(date: string, name: string | null, productId: string) {
  const dinner = (await listActiveMealTypes(db)).find((mealType) => mealType.seedKey === "dinner")!;
  const slotCategoryId = (await listActiveCategories(db))[0]!.id;
  const meal = await createMeal(db, { date, hour: "19:30", name, mealTypeId: dinner.id });
  await db
    .insert(mealSlots)
    .values({ mealId: meal.id, slotCategoryId, position: 0, content: "product", productId, quantity: 100 });
  return meal;
}

async function aProduct(name: string) {
  const result = await createProduct(db, { name, defaultUnit: "g", density: null, packSize: null, categoryIds: [] });
  if (!result.ok) throw new Error(`Could not create ${name}: ${result.error}`);
  return result.product;
}

describe("restockProduct", () => {
  it("adds to the Product's Stock and records a Restock movement", async () => {
    const product = await aProduct("Flour");

    await restockProduct(db, product.id, 1000);

    expect((await getProduct(db, product.id))?.stock).toBe(1000);
    expect(await listStockMovements(db, product.id)).toEqual([
      expect.objectContaining({ type: "restock", delta: 1000, resultingQuantity: 1000, createdAt: expect.any(Date) }),
    ]);
  });

  it("adds each Restock to the Stock left by the previous one", async () => {
    const product = await aProduct("Sugar");

    await restockProduct(db, product.id, 500);
    await restockProduct(db, product.id, 250.5);

    expect((await getProduct(db, product.id))?.stock).toBe(750.5);
  });

  it('keeps the "stock was probably wrong" flag', async () => {
    const product = await aProduct("Eggs");
    await discardProductStock(db, product.id, 6);

    await restockProduct(db, product.id, 12);

    expect(await getProduct(db, product.id)).toMatchObject({ stock: 12, stockSuspect: true });
  });
});

describe("discardProductStock", () => {
  it("subtracts from the Product's Stock and records a Discard movement", async () => {
    const product = await aProduct("Milk powder");
    await restockProduct(db, product.id, 500);

    await discardProductStock(db, product.id, 200);

    expect(await getProduct(db, product.id)).toMatchObject({ stock: 300, stockSuspect: false });
    expect((await listStockMovements(db, product.id))[0]).toMatchObject({
      type: "discard",
      delta: -200,
      resultingQuantity: 300,
    });
  });

  it('clamps at 0 and flags the Product as "stock was probably wrong"', async () => {
    const product = await aProduct("Butter");
    await restockProduct(db, product.id, 100);

    await discardProductStock(db, product.id, 250);

    expect(await getProduct(db, product.id)).toMatchObject({ stock: 0, stockSuspect: true });
    expect((await listStockMovements(db, product.id))[0]).toMatchObject({ delta: -100, resultingQuantity: 0 });
  });

  it("clamps a Discard too big for a Stock column to hold", async () => {
    const product = await aProduct("Beef steak");
    await restockProduct(db, product.id, 400);

    await discardProductStock(db, product.id, 123123123);

    expect(await getProduct(db, product.id)).toMatchObject({ stock: 0, stockSuspect: true });
    expect((await listStockMovements(db, product.id))[0]).toMatchObject({ delta: -400, resultingQuantity: 0 });
  });
});

describe("correctProductStock", () => {
  it("sets the Product's Stock to the quantity on hand, records a Correction and clears the flag", async () => {
    const product = await aProduct("Cocoa");
    await discardProductStock(db, product.id, 50);

    await correctProductStock(db, product.id, 120);

    expect(await getProduct(db, product.id)).toMatchObject({ stock: 120, stockSuspect: false });
    expect((await listStockMovements(db, product.id))[0]).toMatchObject({
      type: "correction",
      delta: 120,
      resultingQuantity: 120,
    });
  });
});

describe("listStockMovements", () => {
  it("lists a Product's movements newest first, and only that Product's", async () => {
    const rice = await aProduct("Rice");
    const oats = await aProduct("Oats");
    await restockProduct(db, rice.id, 1000);
    await restockProduct(db, oats.id, 400);
    await restockProduct(db, rice.id, 500);

    expect(
      (await listStockMovements(db, rice.id)).map(({ delta, resultingQuantity }) => ({ delta, resultingQuantity })),
    ).toEqual([
      { delta: 500, resultingQuantity: 1500 },
      { delta: 1000, resultingQuantity: 1000 },
    ]);
  });

  it("shows only the newest rows when given a limit", async () => {
    const barley = await aProduct("Barley");
    await restockProduct(db, barley.id, 1);
    await restockProduct(db, barley.id, 2);
    await restockProduct(db, barley.id, 3);

    expect((await listStockMovements(db, barley.id, 2)).map(({ delta }) => delta)).toEqual([3, 2]);
  });

  it("keeps rows that share a time in the same order at any limit", async () => {
    const quinoa = await aProduct("Quinoa");
    const createdAt = new Date("2026-10-27T12:00:00Z");
    await db
      .insert(stockMovements)
      .values(
        [1, 2, 3, 4, 5, 6].map((delta) => ({
          createdAt,
          productId: quinoa.id,
          type: "restock" as const,
          delta,
          resultingQuantity: delta,
        })),
      );

    const ids = (await listStockMovements(db, quinoa.id)).map(({ id }) => id);

    expect(ids).toEqual(ids.toSorted().reverse());
    expect((await listStockMovements(db, quinoa.id, 2)).map(({ id }) => id)).toEqual(ids.slice(0, 2));
    expect((await listStockMovements(db, quinoa.id, 4)).map(({ id }) => id)).toEqual(ids.slice(0, 4));
  });

  it("gives a Confirmation its Meal", async () => {
    const pasta = await aProduct("Pasta");
    await restockProduct(db, pasta.id, 500);
    const meal = await aDinner("2026-10-27", "Rice bowl", pasta.id);

    await confirmMeal(db, meal.id, { untracked: false, today: TODAY });

    expect((await listStockMovements(db, pasta.id))[0]).toMatchObject({
      type: "confirmation",
      meal: { date: "2026-10-27", name: "Rice bowl", mealType: { seedKey: "dinner", name: null } },
    });
  });

  it("gives only a Confirmation its Meal, not a Reopen or a Restock", async () => {
    const lentils = await aProduct("Lentils");
    await restockProduct(db, lentils.id, 500);
    const meal = await aDinner("2026-10-27", null, lentils.id);
    await confirmMeal(db, meal.id, { untracked: false, today: TODAY });

    await reopenMeal(db, meal.id);

    const history = await listStockMovements(db, lentils.id);
    expect(history.find(({ type }) => type === "confirmation")?.meal?.name).toBeNull();
    expect(history.find(({ type }) => type === "confirmation")?.meal?.date).toBe("2026-10-27");
    expect(history.find(({ type }) => type === "reopen")?.meal).toBeNull();
    expect(history.find(({ type }) => type === "restock")?.meal).toBeNull();
  });

  it("leaves out a Meal that no longer exists", async () => {
    const beans = await aProduct("Beans");
    await restockProduct(db, beans.id, 500);
    const meal = await aDinner("2026-10-27", "Chili", beans.id);
    await confirmMeal(db, meal.id, { untracked: false, today: TODAY });
    await reopenMeal(db, meal.id);

    await deleteMeal(db, meal.id);

    const history = await listStockMovements(db, beans.id);
    expect(history.find(({ type }) => type === "confirmation")).toMatchObject({ delta: -100, meal: null });
  });
});
