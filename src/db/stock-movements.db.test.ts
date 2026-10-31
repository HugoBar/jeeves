import { beforeAll, describe, expect, it } from "vitest";
import { createProduct, getProduct } from "./products";
import { correctProductStock, discardProductStock, listStockMovements, restockProduct } from "./stock-movements";
import { createTestDb } from "./test-database";

let db: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  db = await createTestDb();
});

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
});
