// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShoppingListItem } from "@/db/shopping-list";
import { setAllShoppingListItemsTickedAction, setShoppingListItemTickedAction } from "./actions";
import { ShoppingListView } from "./shopping-list";

// React only flushes updates inside act() when told it runs in a test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The server actions, so what the list sends can be read back.
vi.mock("./actions", () => ({
  removeShoppingListItemAction: vi.fn(),
  generateShoppingListAction: vi.fn(),
  setShoppingListItemTickedAction: vi.fn(),
  setAllShoppingListItemsTickedAction: vi.fn(),
  restockTickedItemsAction: vi.fn(),
}));
const setTicked = vi.mocked(setShoppingListItemTickedAction);
const setAllTicked = vi.mocked(setAllShoppingListItemsTickedAction);

const item = (
  name: string,
  ticked: boolean,
  quantity: number | null,
  defaultUnit: "g" | "ml" | "pc",
  packSize: { name: string; amount: number } | null = null,
): ShoppingListItem => ({
  id: `item-${name}`,
  quantity,
  source: quantity === null ? "manual" : "shortfall",
  ticked,
  product: { id: `product-${name}`, name, defaultUnit, packSize },
});

const beef = item("Ground beef", true, 300, "g", { name: "pack", amount: 500 });
const milk = item("Whole milk", true, 1400, "ml", { name: "carton", amount: 1000 });
const spinach = item("Spinach", false, 100, "g", { name: "bag", amount: 200 });

let container: HTMLDivElement;
let root: Root;

const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
const press = (element: Element | null | undefined) =>
  act(async () => {
    (element as HTMLElement).click();
  });
const row = (name: string) => [...container.querySelectorAll("li")].find((li) => text(li).includes(name));

const show = (items: ShoppingListItem[]) =>
  act(() => root.render(createElement(ShoppingListView, { items, today: "2026-11-11", products: [], candidates: [], shortfalls: [] })));

beforeEach(() => {
  setTicked.mockReset().mockResolvedValue();
  setAllTicked.mockReset().mockResolvedValue();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("ticking a Shopping List item", () => {
  it("strikes a ticked item's name through, and not an unticked one's", () => {
    show([beef, spinach]);

    expect(row("Ground beef")?.classList).toContain("shopping-item-ticked");
    expect(row("Spinach")?.classList).not.toContain("shopping-item-ticked");
  });

  it("ticks an item as bought", async () => {
    show([spinach]);

    await press(row("Spinach")?.querySelector('input[type="checkbox"]'));

    expect(setTicked).toHaveBeenCalledWith("item-Spinach", true);
  });

  it("unticks a ticked item", async () => {
    show([beef]);

    await press(row("Ground beef")?.querySelector('input[type="checkbox"]'));

    expect(setTicked).toHaveBeenCalledWith("item-Ground beef", false);
  });

  it("names each tick box by its Product", () => {
    show([spinach]);

    expect(row("Spinach")?.querySelector('input[type="checkbox"]')?.getAttribute("aria-label")).toBe("Bought Spinach");
  });
});

describe("ticking every item", () => {
  const tickAll = () => container.querySelector<HTMLInputElement>(".shopping-tick-all input");

  it("isn't there with nothing on the list", () => {
    show([]);

    expect(tickAll()).toBeNull();
  });

  it("sits under the field for adding by hand, named Tick all", () => {
    show([spinach]);

    expect(text(container.querySelector(".shopping-tick-all"))).toBe("Tick all");
    expect(container.querySelector(".hand-add + .shopping-tick-all")).not.toBeNull();
  });

  it("is empty with nothing ticked, and ticks every item", async () => {
    show([spinach, item("Rice", false, 500, "g")]);
    expect(tickAll()?.checked).toBe(false);
    expect(tickAll()?.indeterminate).toBe(false);

    await press(tickAll());

    expect(setAllTicked).toHaveBeenCalledWith(true);
  });

  it("is half-filled with some ticked, and ticks the rest", async () => {
    show([beef, spinach]);
    expect(tickAll()?.checked).toBe(false);
    expect(tickAll()?.indeterminate).toBe(true);

    await press(tickAll());

    expect(setAllTicked).toHaveBeenCalledWith(true);
  });

  it("is ticked with every item ticked, and unticks them all", async () => {
    show([beef, milk]);
    expect(tickAll()?.checked).toBe(true);

    await press(tickAll());

    expect(setAllTicked).toHaveBeenCalledWith(false);
  });
});
