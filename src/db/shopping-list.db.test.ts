import { beforeAll, describe, expect, it } from "vitest";
import { createProduct } from "./products";
import { shoppingListItems } from "./schema";
import { listShoppingList, removeShoppingListItem } from "./shopping-list";
import { createTestDb } from "./test-database";

let db: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  db = await createTestDb();
});

async function aProduct(name: string, packSize: { name: string; amount: number } | null = null) {
  const result = await createProduct(db, { name, defaultUnit: "g", density: null, packSize, categoryIds: [] });
  if (!result.ok) throw new Error(`Could not create ${name}: ${result.error}`);
  return result.product;
}

describe("listShoppingList", () => {
  it("is empty before anything is added", async () => {
    expect(await listShoppingList(db)).toEqual([]);
  });

  it("reads each item with what its row shows of the Product", async () => {
    const spinach = await aProduct("Spinach", { name: "bag", amount: 500 });
    const salt = await aProduct("Salt");
    await db.insert(shoppingListItems).values([
      { productId: spinach.id, quantity: 250, source: "shortfall", ticked: true },
      { productId: salt.id, quantity: null, source: "manual" },
    ]);

    expect(await listShoppingList(db)).toEqual([
      {
        id: expect.any(String),
        quantity: null,
        source: "manual",
        ticked: false,
        product: { id: salt.id, name: "Salt", defaultUnit: "g", packSize: null },
      },
      {
        id: expect.any(String),
        quantity: 250,
        source: "shortfall",
        ticked: true,
        product: { id: spinach.id, name: "Spinach", defaultUnit: "g", packSize: { name: "bag", amount: 500 } },
      },
    ]);
  });

  it("holds one unticked item per Product", async () => {
    const rice = await aProduct("Rice");
    await db.insert(shoppingListItems).values({ productId: rice.id, quantity: 100, source: "shortfall" });

    await expect(
      db.insert(shoppingListItems).values({ productId: rice.id, quantity: null, source: "manual" }),
    ).rejects.toThrow();
  });

  it("can hold a ticked item and an unticked one for the same Product", async () => {
    const oats = await aProduct("Oats");
    await db.insert(shoppingListItems).values([
      { productId: oats.id, quantity: 100, source: "shortfall", ticked: true },
      { productId: oats.id, quantity: 150, source: "shortfall" },
    ]);

    const items = (await listShoppingList(db)).filter((item) => item.product.id === oats.id);
    expect(items.map(({ quantity, ticked }) => ({ quantity, ticked }))).toEqual(
      expect.arrayContaining([
        { quantity: 100, ticked: true },
        { quantity: 150, ticked: false },
      ]),
    );
  });
});

describe("removeShoppingListItem", () => {
  it("takes the item off the list and leaves the others", async () => {
    const flour = await aProduct("Flour");
    const sugar = await aProduct("Sugar");
    await db.insert(shoppingListItems).values([
      { productId: flour.id, quantity: 500, source: "shortfall" },
      { productId: sugar.id, quantity: 200, source: "shortfall" },
    ]);
    const onList = async () =>
      (await listShoppingList(db)).filter((item) => [flour.id, sugar.id].includes(item.product.id));
    const [flourItem] = await onList();

    await removeShoppingListItem(db, flourItem!.id);

    expect((await onList()).map((item) => item.product.name)).toEqual(["Sugar"]);
  });
});
