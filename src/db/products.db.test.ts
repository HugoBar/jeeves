import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { DefaultUnit } from "@/core/units";
import { createProduct, getProduct, listActiveProducts, updateProduct } from "./products";
import { products } from "./schema";
import { createTestDb } from "./test-database";

let db: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  db = await createTestDb();
});

// A plain Product under a name no other test uses.
async function aProduct(name: string, defaultUnit: DefaultUnit = "g") {
  const result = await createProduct(db, { name, defaultUnit, density: null, packSize: null });
  if (!result.ok) throw new Error(`Could not create ${name}: ${result.error}`);
  return result.product;
}

async function archive(id: string) {
  await db.update(products).set({ archivedAt: new Date() }).where(eq(products.id, id));
}

describe("createProduct", () => {
  it("adds a Product with no Stock to the Stock list", async () => {
    const result = await createProduct(db, {
      name: "Rice",
      defaultUnit: "g",
      density: 0.85,
      packSize: { name: "bag", amount: 1000 },
    });

    expect(result.ok).toBe(true);
    expect(await listActiveProducts(db)).toContainEqual({
      id: result.ok ? result.product.id : undefined,
      name: "Rice",
      defaultUnit: "g",
      density: 0.85,
      packSize: { name: "bag", amount: 1000 },
      stock: 0,
      stockSuspect: false,
    });
  });

  it("refuses a name another Product already has, ignoring case", async () => {
    await aProduct("Basmati");

    expect(
      await createProduct(db, { name: "BASMATI", defaultUnit: "g", density: null, packSize: null }),
    ).toEqual({ ok: false, error: "duplicateName" });
  });

  it("allows the name of an Archived Product", async () => {
    await archive((await aProduct("Green Tea")).id);

    expect((await createProduct(db, { name: "Green Tea", defaultUnit: "g", density: null, packSize: null })).ok).toBe(
      true,
    );
  });
});

describe("listActiveProducts", () => {
  it("leaves out Archived Products", async () => {
    const product = await aProduct("Old Tea");
    await archive(product.id);

    expect((await listActiveProducts(db)).map((p) => p.id)).not.toContain(product.id);
  });
});

describe("updateProduct", () => {
  it("changes the editable fields and keeps the Default Unit and Stock", async () => {
    const product = await aProduct("Olive Oil", "ml");

    expect(
      await updateProduct(db, product.id, {
        name: "Extra Virgin Olive Oil",
        density: 0.9152,
        packSize: { name: "bottle", amount: 750 },
      }),
    ).toEqual({ ok: true });
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

  it("refuses to rename a Product to another Product's name", async () => {
    await aProduct("Oats");
    const product = await aProduct("Porridge Oats");

    expect(await updateProduct(db, product.id, { name: "oats", density: null, packSize: null })).toEqual({
      ok: false,
      error: "duplicateName",
    });
    expect((await getProduct(db, product.id))?.name).toBe("Porridge Oats");
  });

  it("lets a Product keep its own name", async () => {
    const product = await aProduct("Honey");

    expect(await updateProduct(db, product.id, { name: "honey", density: 1.42, packSize: null })).toEqual({
      ok: true,
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
