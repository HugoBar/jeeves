// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShoppingListItem } from "@/db/shopping-list";
import { addProductByHandAction } from "./actions";
import type { HandAddProduct } from "./add-by-hand";
import { ShoppingListView } from "./shopping-list";

// React only flushes updates inside act() when told it runs in a test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The server actions, so what the field sends can be read back.
vi.mock("./actions", () => ({
  addProductByHandAction: vi.fn(),
  removeShoppingListItemAction: vi.fn(),
  generateShoppingListAction: vi.fn(),
}));
const add = vi.mocked(addProductByHandAction);

const product = (name: string, packSize: { name: string; amount: number } | null = null): HandAddProduct => ({
  id: `product-${name}`,
  name,
  defaultUnit: "g",
  packSize,
});

// A to Z, as the page reads them.
const products = [
  product("Apple", { name: "bag", amount: 6 }),
  product("Bread"),
  product("Café"),
  product("Chicken thighs", { name: "pack", amount: 600 }),
  product("Coconut milk", { name: "can", amount: 400 }),
  product("Coffee beans", { name: "bag", amount: 250 }),
  product("Cod fillet"),
  product("Corn flakes", { name: "box", amount: 500 }),
];

const item = (name: string, quantity: number | null, ticked: boolean): ShoppingListItem => {
  const { id, ...rest } = products.find((each) => each.name === name)!;
  return { id: `item-${name}-${ticked}`, quantity, source: "shortfall", ticked, product: { id, ...rest } };
};

let container: HTMLDivElement;
let root: Root;

const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
const field = () => container.querySelector<HTMLInputElement>('input[aria-label="Add a Product by hand"]')!;
// Each option's name, what adding does, and its button, apart.
const options = () =>
  [...container.querySelectorAll(".hand-add-option")].map((option) => [...option.children].map(text).join(" "));
const button = (label: string) => [...container.querySelectorAll("button")].find((each) => text(each) === label);
const press = (element: Element | null | undefined) =>
  act(async () => {
    (element as HTMLElement).click();
  });
const open = () =>
  act(async () => {
    field().focus();
  });
// Typing as React sees it: the value set past React's own setter, then input.
const type = (value: string) =>
  act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(field(), value);
    field().dispatchEvent(new Event("input", { bubbles: true }));
  });

const render = (items: ShoppingListItem[]) =>
  act(() => root.render(createElement(ShoppingListView, { items, today: "2026-11-11", products, candidates: [] })));

beforeEach(() => {
  add.mockReset().mockResolvedValue(null);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("adding a Product by hand", () => {
  it("sits at the top of the empty list, closed", () => {
    render([]);

    expect(field().placeholder).toBe("Add a Product by hand");
    expect(options()).toEqual([]);
    expect(text(container)).toContain("Nothing on the list");
  });

  it("opens on tap, listing the first 5 Products A to Z, and Show all lists the rest", async () => {
    render([]);
    await open();

    expect(options().map((option) => option.split(" ·")[0])).toEqual([
      "Apple Pack Size",
      "Bread No Pack Size Add",
      "Café No Pack Size Add",
      "Chicken thighs Pack Size",
      "Coconut milk Pack Size",
    ]);
    await press(button("Show all 8 Products"));
    expect(options()).toHaveLength(8);
  });

  it("closes on Cancel", async () => {
    render([]);
    await open();
    await press(button("Cancel"));

    expect(options()).toEqual([]);
    expect(button("Cancel")).toBeUndefined();
  });

  it("shows the Products whose name matches what is typed, ignoring case and accents", async () => {
    render([]);
    await open();
    await type("CAFE ");

    expect(options()).toEqual(["Café No Pack Size Add"]);
  });

  it("shows each Product's Pack Size and what its button adds", async () => {
    render([]);
    await open();
    await type("co");

    expect(options()).toEqual([
      "Coconut milk Pack Size · can, 400 g 1 can",
      "Coffee beans Pack Size · bag, 250 g 1 bag",
      "Cod fillet No Pack Size Add",
      "Corn flakes Pack Size · box, 500 g 1 box",
    ]);
  });

  it("says whether the pack adds to an unticked item or goes on a new line", async () => {
    render([item("Coconut milk", 800, true), item("Coffee beans", 100, false), item("Cod fillet", 150, false)]);
    await open();
    await type("co");

    expect(options()).toEqual([
      "Coconut milk On the list, ticked · goes on a new line 1 can",
      "Coffee beans On the list, not ticked · adds to its 1 bag 1 bag",
      "Cod fillet On the list, not ticked · stays as it is Add",
      "Corn flakes Pack Size · box, 500 g 1 box",
    ]);
  });

  it("adds the Product and stays open for the next one", async () => {
    render([]);
    await open();
    await type("corn");
    await press(container.querySelector('button[aria-label="Add 1 box of Corn flakes"]'));

    expect(add).toHaveBeenCalledWith("product-Corn flakes");
    expect(options()).toEqual(["Corn flakes Pack Size · box, 500 g 1 box"]);
  });

  it("highlights the item added or changed", async () => {
    add.mockResolvedValue("item-Coffee beans-false");
    render([item("Coffee beans", 100, false), item("Cod fillet", 150, false)]);
    await open();
    await type("coffee");
    await press(container.querySelector('button[aria-label="Add 1 bag of Coffee beans"]'));

    const fresh = [...container.querySelectorAll(".shopping-item-fresh")].map(text);
    expect(fresh).toHaveLength(1);
    expect(fresh[0]).toContain("Coffee beans");
  });

  it("links to adding a Product in Stock", async () => {
    render([]);
    await open();

    const link = [...container.querySelectorAll("a")].find((each) => text(each) === "Not here? Add it in Stock");
    expect(link?.getAttribute("href")).toBe("/products/new");
  });
});
