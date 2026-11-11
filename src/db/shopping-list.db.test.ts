import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createProduct } from "./products";
import { products, shoppingListItems } from "./schema";
import { addProductByHand, listShoppingList, removeShoppingListItem } from "./shopping-list";
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

describe("addProductByHand", () => {
  // A Product's items, its ticked one first.
  const itemsOf = async (productId: string) =>
    (await listShoppingList(db))
      .filter((item) => item.product.id === productId)
      .map(({ id, quantity, source, ticked }) => ({ id, quantity, source, ticked }))
      .sort((a, b) => Number(b.ticked) - Number(a.ticked));

  it("puts one pack on the list as a new item added by hand", async () => {
    const cornFlakes = await aProduct("Corn flakes", { name: "box", amount: 500 });

    const result = await addProductByHand(db, cornFlakes.id);

    const items = await itemsOf(cornFlakes.id);
    expect(items).toEqual([{ id: expect.any(String), quantity: 500, source: "manual", ticked: false }]);
    expect(result).toEqual({ ok: true, itemId: items[0]!.id });
  });

  it("puts a Product without a Pack Size on with no amount", async () => {
    const cod = await aProduct("Cod fillet");

    await addProductByHand(db, cod.id);

    expect(await itemsOf(cod.id)).toEqual([{ id: expect.any(String), quantity: null, source: "manual", ticked: false }]);
  });

  it("adds the pack to the Product's unticked item, which keeps where it came from", async () => {
    const coffee = await aProduct("Coffee beans", { name: "bag", amount: 250 });
    const [made] = await db
      .insert(shoppingListItems)
      .values({ productId: coffee.id, quantity: 100, source: "shortfall" })
      .returning({ id: shoppingListItems.id });

    const result = await addProductByHand(db, coffee.id);

    expect(result).toEqual({ ok: true, itemId: made!.id });
    expect(await itemsOf(coffee.id)).toEqual([{ id: made!.id, quantity: 350, source: "shortfall", ticked: false }]);
  });

  it("puts the pack on a new item when the Product's only item is ticked", async () => {
    const coconut = await aProduct("Coconut milk", { name: "can", amount: 400 });
    await db.insert(shoppingListItems).values({ productId: coconut.id, quantity: 800, source: "shortfall", ticked: true });

    await addProductByHand(db, coconut.id);

    expect(await itemsOf(coconut.id)).toEqual([
      { id: expect.any(String), quantity: 800, source: "shortfall", ticked: true },
      { id: expect.any(String), quantity: 400, source: "manual", ticked: false },
    ]);
  });

  it("leaves the unticked item of a Product without a Pack Size as it is", async () => {
    const salmon = await aProduct("Salmon fillet");
    const [made] = await db
      .insert(shoppingListItems)
      .values({ productId: salmon.id, quantity: 150, source: "shortfall" })
      .returning({ id: shoppingListItems.id });

    expect(await addProductByHand(db, salmon.id)).toEqual({ ok: true, itemId: made!.id });
    expect(await itemsOf(salmon.id)).toEqual([{ id: made!.id, quantity: 150, source: "shortfall", ticked: false }]);
  });

  it("refuses an Archived Product, and adds nothing", async () => {
    const pasta = await aProduct("Old pasta", { name: "pack", amount: 500 });
    await db.update(products).set({ archivedAt: new Date() }).where(eq(products.id, pasta.id));

    expect(await addProductByHand(db, pasta.id)).toEqual({ ok: false, error: "unavailable" });
    expect(await itemsOf(pasta.id)).toEqual([]);
  });
});
