import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { DefaultUnit } from "@/core/units";
import { createCategory, removeCategory } from "./food-categories";
import { createProduct, getProduct, listActiveProducts, updateProduct } from "./products";
import { products } from "./schema";
import { createTestDb } from "./test-database";

let db: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  db = await createTestDb();
});

// A plain Product under a name no other test uses.
async function aProduct(name: string, defaultUnit: DefaultUnit = "g") {
  const result = await createProduct(db, { name, defaultUnit, density: null, packSize: null, categoryIds: [] });
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
      categoryIds: [],
    });

    expect(result.ok).toBe(true);
    expect(await listActiveProducts(db)).toContainEqual({
      id: result.ok ? result.product.id : undefined,
      name: "Rice",
      defaultUnit: "g",
      density: 0.85,
      packSize: { name: "bag", amount: 1000 },
      categoryIds: [],
      stock: 0,
      stockSuspect: false,
    });
  });

  it("refuses a name another Product already has, ignoring case", async () => {
    await aProduct("Basmati");

    expect(
      await createProduct(db, { name: "BASMATI", defaultUnit: "g", density: null, packSize: null, categoryIds: [] }),
    ).toEqual({ ok: false, error: "duplicateName" });
  });

  it("allows the name of an Archived Product", async () => {
    await archive((await aProduct("Green Tea")).id);

    expect((await createProduct(db, { name: "Green Tea", defaultUnit: "g", density: null, packSize: null, categoryIds: [] })).ok).toBe(
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
        categoryIds: [],
      }),
    ).toEqual({ ok: true });
    expect(await getProduct(db, product.id)).toEqual({
      id: product.id,
      name: "Extra Virgin Olive Oil",
      defaultUnit: "ml",
      density: 0.9152,
      packSize: { name: "bottle", amount: 750 },
      categoryIds: [],
      stock: 0,
      stockSuspect: false,
    });
  });

  it("refuses to rename a Product to another Product's name", async () => {
    await aProduct("Oats");
    const product = await aProduct("Porridge Oats");

    expect(await updateProduct(db, product.id, { name: "oats", density: null, packSize: null, categoryIds: [] })).toEqual({
      ok: false,
      error: "duplicateName",
    });
    expect((await getProduct(db, product.id))?.name).toBe("Porridge Oats");
  });

  it("lets a Product keep its own name", async () => {
    const product = await aProduct("Honey");

    expect(await updateProduct(db, product.id, { name: "honey", density: 1.42, packSize: null, categoryIds: [] })).toEqual({
      ok: true,
    });
  });
});

describe("Food Categories on Products", () => {
  it("links a new Product to the Food Categories picked", async () => {
    const grains = await createCategory(db, { name: "Whole Grains", kind: "kind" });
    const side = await createCategory(db, { name: "Side", kind: "role" });

    const result = await createProduct(db, {
      name: "Brown Rice",
      defaultUnit: "g",
      density: null,
      packSize: null,
      categoryIds: [grains.id, side.id],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((await getProduct(db, result.product.id))?.categoryIds.sort()).toEqual([grains.id, side.id].sort());
  });

  it("replaces a Product's Food Categories with the ones picked when editing", async () => {
    const dairy = await createCategory(db, { name: "Milk Products", kind: "kind" });
    const snack = await createCategory(db, { name: "Nibbles", kind: "role" });
    const product = await aProduct("Yoghurt");
    await updateProduct(db, product.id, { name: "Yoghurt", density: null, packSize: null, categoryIds: [dairy.id] });

    await updateProduct(db, product.id, { name: "Yoghurt", density: null, packSize: null, categoryIds: [snack.id] });

    expect((await getProduct(db, product.id))?.categoryIds).toEqual([snack.id]);
  });

  it("hides an Archived Food Category on the Product but keeps the link through an edit", async () => {
    const legumes = await createCategory(db, { name: "Pulses", kind: "kind" });
    const main = await createCategory(db, { name: "Mains", kind: "role" });
    const product = await aProduct("Chickpeas");
    await updateProduct(db, product.id, {
      name: "Chickpeas",
      density: null,
      packSize: null,
      categoryIds: [legumes.id, main.id],
    });
    expect(await removeCategory(db, legumes.id)).toBe("archived");

    expect((await getProduct(db, product.id))?.categoryIds).toEqual([main.id]);
    expect((await listActiveProducts(db)).find((p) => p.id === product.id)?.categoryIds).toEqual([main.id]);
    // The picker no longer offers it, so the edit does not send it back.
    await updateProduct(db, product.id, { name: "Chickpeas", density: null, packSize: null, categoryIds: [main.id] });
    // Removing it again only Archives it if the Product still links to it.
    expect(await removeCategory(db, legumes.id)).toBe("archived");
  });

  it("ignores a Food Category that was Archived before the Product was saved", async () => {
    const herbs = await createCategory(db, { name: "Herbs", kind: "kind" });
    const product = await aProduct("Basil");
    await removeCategory(db, herbs.id);

    await updateProduct(db, product.id, { name: "Basil", density: null, packSize: null, categoryIds: [herbs.id] });

    // Nothing links to it, so it can now be hard deleted.
    expect(await removeCategory(db, herbs.id)).toBe("deleted");
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
