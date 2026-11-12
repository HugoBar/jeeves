import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { restockStart } from "@/core/shopping-list";
import { createProduct } from "./products";
import { products, shoppingListItems } from "./schema";
import {
  addProductByHand,
  listShoppingList,
  removeShoppingListItem,
  restockTickedItems,
  setAllShoppingListItemsTicked,
  setShoppingListItemQuantity,
  setShoppingListItemTicked,
  shoppingListItemPackAmount,
} from "./shopping-list";
import { listStockMovements } from "./stock-movements";
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

describe("setShoppingListItemTicked", () => {
  const itemsOf = async (productId: string) =>
    (await listShoppingList(db))
      .filter((item) => item.product.id === productId)
      .map(({ id, quantity, ticked }) => ({ id, quantity, ticked }))
      .sort((a, b) => Number(b.ticked) - Number(a.ticked));

  it("ticks an item and unticks it again, leaving Stock as it is", async () => {
    const lentils = await aProduct("Lentils");
    const [item] = await db
      .insert(shoppingListItems)
      .values({ productId: lentils.id, quantity: 400, source: "shortfall" })
      .returning({ id: shoppingListItems.id });

    await setShoppingListItemTicked(db, item!.id, true);
    expect(await itemsOf(lentils.id)).toEqual([{ id: item!.id, quantity: 400, ticked: true }]);

    await setShoppingListItemTicked(db, item!.id, false);
    expect(await itemsOf(lentils.id)).toEqual([{ id: item!.id, quantity: 400, ticked: false }]);
    const [after] = await db.select({ stock: products.stock }).from(products).where(eq(products.id, lentils.id));
    expect(after!.stock).toBe(0);
  });

  it("adds an unticked item to its Product's other unticked item", async () => {
    const spinach = await aProduct("Baby spinach");
    const [ticked, unticked] = await db
      .insert(shoppingListItems)
      .values([
        { productId: spinach.id, quantity: 100, source: "shortfall", ticked: true },
        { productId: spinach.id, quantity: 150, source: "shortfall" },
      ])
      .returning({ id: shoppingListItems.id });

    await setShoppingListItemTicked(db, ticked!.id, false);

    expect(await itemsOf(spinach.id)).toEqual([{ id: unticked!.id, quantity: 250, ticked: false }]);
  });

  it("does nothing to an item gone meanwhile", async () => {
    await expect(setShoppingListItemTicked(db, "00000000-0000-4000-8000-000000000000", true)).resolves.toBeUndefined();
  });
});

describe("setShoppingListItemQuantity", () => {
  const anItem = async (name: string, quantity: number | null, ticked = false) => {
    const product = await aProduct(name, { name: "bag", amount: 500 });
    const [item] = await db
      .insert(shoppingListItems)
      .values({ productId: product.id, quantity, source: "shortfall", ticked })
      .returning({ id: shoppingListItems.id });
    return item!.id;
  };
  const stored = async (id: string) =>
    (await listShoppingList(db))
      .filter((item) => item.id === id)
      .map(({ quantity, source, ticked }) => ({ quantity, source, ticked }))[0];

  it("sets an unticked item's amount, which then counts as added by hand", async () => {
    const id = await anItem("Brown rice", 100);

    expect(await setShoppingListItemQuantity(db, id, 1000)).toBe(true);

    expect(await stored(id)).toEqual({ quantity: 1000, source: "manual", ticked: false });
  });

  it("gives an amount to an item with none", async () => {
    const id = await anItem("Rolled oats", null);

    await setShoppingListItemQuantity(db, id, 600);

    expect((await stored(id))?.quantity).toBe(600);
  });

  it("refuses a ticked item and leaves it as it is", async () => {
    const id = await anItem("Red lentils", 100, true);

    expect(await setShoppingListItemQuantity(db, id, 1000)).toBe(false);

    expect(await stored(id)).toEqual({ quantity: 100, source: "shortfall", ticked: true });
  });

  it("refuses an amount of 0 or below", async () => {
    const id = await anItem("Couscous", 100);

    await expect(setShoppingListItemQuantity(db, id, 0)).rejects.toThrow();
    await expect(setShoppingListItemQuantity(db, id, -500)).rejects.toThrow();

    expect((await stored(id))?.quantity).toBe(100);
  });

  it("does nothing to an item gone meanwhile", async () => {
    expect(await setShoppingListItemQuantity(db, "00000000-0000-4000-8000-000000000000", 500)).toBe(false);
  });

  it("is where Restock ticked items starts from, once ticked", async () => {
    const id = await anItem("Bulgur", 100);
    await setShoppingListItemQuantity(db, id, 1500);
    await setShoppingListItemTicked(db, id, true);

    const [item] = (await listShoppingList(db)).filter((found) => found.id === id);
    expect(restockStart(item!.quantity, item!.product.packSize!.amount)).toBe(1500);
  });
});

describe("shoppingListItemPackAmount", () => {
  it("is the amount of the item's Pack Size, or null without one", async () => {
    const bagged = await aProduct("Quinoa", { name: "bag", amount: 500 });
    const loose = await aProduct("Barley");
    const [withPack, withoutPack] = await db
      .insert(shoppingListItems)
      .values([
        { productId: bagged.id, quantity: 100, source: "shortfall" },
        { productId: loose.id, quantity: 100, source: "shortfall" },
      ])
      .returning({ id: shoppingListItems.id });

    expect(await shoppingListItemPackAmount(db, withPack!.id)).toEqual({ packAmount: 500 });
    expect(await shoppingListItemPackAmount(db, withoutPack!.id)).toEqual({ packAmount: null });
  });

  it("is null for an item gone meanwhile", async () => {
    expect(await shoppingListItemPackAmount(db, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});

describe("restockTickedItems", () => {
  const stockOf = async (productId: string) =>
    (await db.select({ stock: products.stock }).from(products).where(eq(products.id, productId)))[0]!.stock;
  const tickedItem = async (productId: string, quantity: number | null, ticked = true) =>
    (
      await db
        .insert(shoppingListItems)
        .values({ productId, quantity, source: "shortfall", ticked })
        .returning({ id: shoppingListItems.id })
    )[0]!.id;
  const onList = async (...productIds: string[]) =>
    (await listShoppingList(db)).filter((item) => productIds.includes(item.product.id)).map((item) => item.id);

  it("Restocks each item by the amount bought and takes them off the list", async () => {
    const beef = await aProduct("Minced beef", { name: "pack", amount: 500 });
    const milk = await aProduct("Oat milk");
    const beefItem = await tickedItem(beef.id, 300);
    const milkItem = await tickedItem(milk.id, 1400);

    await restockTickedItems(db, [
      { id: beefItem, quantity: 500 },
      { id: milkItem, quantity: 2000 },
    ]);

    expect(await stockOf(beef.id)).toBe(500);
    expect(await stockOf(milk.id)).toBe(2000);
    expect((await listStockMovements(db, milk.id)).map(({ type, delta }) => ({ type, delta }))).toEqual([
      { type: "restock", delta: 2000 },
    ]);
    expect(await onList(beef.id, milk.id)).toEqual([]);
  });

  it("makes two items of one Product two Restocks", async () => {
    const eggs = await aProduct("Free-range eggs");
    const first = await tickedItem(eggs.id, 6);
    const second = await tickedItem(eggs.id, 12);

    await restockTickedItems(db, [
      { id: first, quantity: 6 },
      { id: second, quantity: 12 },
    ]);

    expect(await stockOf(eggs.id)).toBe(18);
    expect((await listStockMovements(db, eggs.id)).map(({ delta }) => delta).sort()).toEqual([12, 6]);
  });

  it("leaves an item gone or unticked meanwhile, and the rest of the list", async () => {
    const butter = await aProduct("Salted butter");
    const jam = await aProduct("Strawberry jam");
    const unticked = await tickedItem(butter.id, 250, false);
    const other = await tickedItem(jam.id, 300);

    await restockTickedItems(db, [
      { id: unticked, quantity: 250 },
      { id: "00000000-0000-4000-8000-000000000000", quantity: 100 },
    ]);

    expect(await stockOf(butter.id)).toBe(0);
    expect(await onList(butter.id, jam.id)).toEqual(expect.arrayContaining([unticked, other]));
  });
});

describe("setAllShoppingListItemsTicked", () => {
  // Each test starts from an empty list, as ticking all reaches every item.
  beforeEach(async () => {
    await db.delete(shoppingListItems);
  });

  const summary = async () =>
    (await listShoppingList(db))
      .map(({ product, quantity, ticked }) => ({ name: product.name, quantity, ticked }))
      .sort((a, b) => a.name.localeCompare(b.name) || Number(b.ticked) - Number(a.ticked));

  it("ticks every item", async () => {
    const tea = await aProduct("Green tea");
    const honey = await aProduct("Honey");
    await db.insert(shoppingListItems).values([
      { productId: tea.id, quantity: 100, source: "shortfall" },
      { productId: honey.id, quantity: 300, source: "shortfall", ticked: true },
    ]);

    await setAllShoppingListItemsTicked(db, true);

    expect(await summary()).toEqual([
      { name: "Green tea", quantity: 100, ticked: true },
      { name: "Honey", quantity: 300, ticked: true },
    ]);
  });

  it("unticks every item, adding a Product's items into one", async () => {
    const yoghurt = await aProduct("Greek yoghurt");
    const bread = await aProduct("Rye bread");
    await db.insert(shoppingListItems).values([
      { productId: yoghurt.id, quantity: 500, source: "shortfall", ticked: true },
      { productId: yoghurt.id, quantity: 250, source: "shortfall" },
      { productId: bread.id, quantity: null, source: "manual", ticked: true },
    ]);

    await setAllShoppingListItemsTicked(db, false);

    expect(await summary()).toEqual([
      { name: "Greek yoghurt", quantity: 750, ticked: false },
      { name: "Rye bread", quantity: null, ticked: false },
    ]);
  });
});
