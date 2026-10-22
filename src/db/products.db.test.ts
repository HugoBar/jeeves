import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createProduct, getProduct, listActiveProducts, updateProduct } from "./products";
import { products } from "./schema";
import { createTestDb } from "./test-database";

let db: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  db = await createTestDb();
});

describe("createProduct", () => {
  it("adds a Product with no Stock to the Stock list", async () => {
    const product = await createProduct(db, {
      name: "Rice",
      defaultUnit: "g",
      density: 0.85,
      packSize: { name: "bag", amount: 1000 },
    });

    expect(await listActiveProducts(db)).toContainEqual({
      id: product.id,
      name: "Rice",
      defaultUnit: "g",
      density: 0.85,
      packSize: { name: "bag", amount: 1000 },
      stock: 0,
      stockSuspect: false,
    });
  });
});

describe("listActiveProducts", () => {
  it("leaves out Archived Products", async () => {
    const product = await createProduct(db, { name: "Old Tea", defaultUnit: "g", density: null, packSize: null });
    await db.update(products).set({ archivedAt: new Date() }).where(eq(products.id, product.id));

    expect((await listActiveProducts(db)).map((p) => p.id)).not.toContain(product.id);
  });
});

describe("updateProduct", () => {
  it("changes the editable fields and keeps the Default Unit and Stock", async () => {
    const product = await createProduct(db, { name: "Olive Oil", defaultUnit: "ml", density: null, packSize: null });

    await updateProduct(db, product.id, {
      name: "Extra Virgin Olive Oil",
      density: 0.9152,
      packSize: { name: "bottle", amount: 750 },
    });

    expect(await getProduct(db, product.id)).toEqual({
      id: product.id,
      name: "Extra Virgin Olive Oil",
      defaultUnit: "ml",
      density: 0.9152,
      packSize: { name: "bottle", amount: 750 },
      stock: 0,
      stockSuspect: false,
    });
  });
});

describe("products table", () => {
  it.each([
    ["a name without an amount", { packSizeName: "bag", packSizeAmount: null }],
    ["an amount without a name", { packSizeName: null, packSizeAmount: 500 }],
  ])("rejects a Pack Size with %s", async (_, packSize) => {
    await expect(
      db.insert(products).values({ name: "Flour", defaultUnit: "g", ...packSize }),
    ).rejects.toThrow();
  });
});
