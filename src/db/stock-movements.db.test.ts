import { beforeAll, describe, expect, it } from "vitest";
import { createProduct, getProduct } from "./products";
import { listStockMovements, restockProduct } from "./stock-movements";
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
