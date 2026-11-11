// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShoppingListItem } from "@/db/shopping-list";
import { restockTickedItemsAction } from "./actions";
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
const restock = vi.mocked(restockTickedItemsAction);

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
const salmon = item("Salmon fillet", true, 150, "g");
const cod = item("Cod", true, null, "g");
const spinach = item("Spinach", false, 100, "g", { name: "bag", amount: 200 });

let container: HTMLDivElement;
let root: Root;

const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
const dialog = () => container.querySelector("dialog");
const press = (element: Element | null | undefined) =>
  act(async () => {
    (element as HTMLElement).click();
  });
const button = (label: string, within: Element | null = container) =>
  [...(within?.querySelectorAll("button") ?? [])].find((found) => text(found) === label);
const field = (name: string) =>
  [...(dialog()?.querySelectorAll("label") ?? [])].find((label) => text(label).startsWith(name))?.querySelector("input");
const type = (input: HTMLInputElement | null | undefined, value: string) =>
  act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, value);
    input!.dispatchEvent(new Event("input", { bubbles: true }));
  });

const show = (items: ShoppingListItem[]) =>
  act(() => root.render(createElement(ShoppingListView, { items, today: "2026-11-11", products: [], candidates: [], shortfalls: [] })));

beforeEach(() => {
  restock.mockReset().mockResolvedValue(null);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("Restock ticked items", () => {
  it("doesn't show with nothing ticked", () => {
    show([spinach]);

    expect(text(container)).not.toContain("Restock");
  });

  it("counts the ticked items", () => {
    show([beef, milk, spinach]);
    expect(button("Restock 2 ticked items")).toBeDefined();

    show([beef, spinach]);
    expect(button("Restock 1 ticked item")).toBeDefined();
  });

  it("asks how much of each ticked item was bought", async () => {
    show([beef, milk, spinach]);

    await press(button("Restock 2 ticked items"));

    expect(text(dialog()?.querySelector(".sheet-eyebrow"))).toBe("Shopping List");
    expect(text(dialog()?.querySelector("h2"))).toBe("Restock 2 ticked items");
    expect(text(dialog())).toContain("How much did you buy? Each one is added to Stock and leaves the list.");
    expect(field("Spinach")).toBeUndefined();
  });

  it("starts each field at the whole packs, in its Default Unit, with the packs beside it", async () => {
    show([beef, milk]);

    await press(button("Restock 2 ticked items"));

    expect(field("Ground beef")?.value).toBe("500");
    expect(field("Whole milk")?.value).toBe("2000");
    const milkRow = field("Whole milk")?.closest(".restock-item");
    expect(text(milkRow?.querySelector(".restock-item-unit"))).toBe("ml");
    expect(text(milkRow?.querySelector(".restock-item-packs"))).toBe("2 cartons");
  });

  it("starts at the amount without a Pack Size, and empty without an amount", async () => {
    show([salmon, cod]);

    await press(button("Restock 2 ticked items"));

    expect(field("Salmon fillet")?.value).toBe("150");
    expect(field("Cod")?.value).toBe("");
  });

  it("Restocks every item by the amounts as typed", async () => {
    show([beef, milk]);
    await press(button("Restock 2 ticked items"));

    await type(field("Ground beef"), "750");
    await press(button("Restock 2 items", dialog()));

    expect(restock).toHaveBeenCalledWith([
      { id: "item-Ground beef", amount: "750" },
      { id: "item-Whole milk", amount: "2000" },
    ]);
    expect(dialog()).toBeNull();
  });

  it("shows why an amount was rejected on its field, and stays open", async () => {
    restock.mockResolvedValue({ "item-Cod": "notAboveZero" });
    show([beef, cod]);
    await press(button("Restock 2 ticked items"));

    await press(button("Restock 2 items", dialog()));

    expect(text(field("Cod")?.closest(".restock-item"))).toContain("Enter an amount above 0.");
    expect(field("Cod")?.getAttribute("aria-invalid")).toBe("true");
    expect(field("Ground beef")?.hasAttribute("aria-invalid")).toBe(false);
  });

  it("clears an amount's error once it is typed again", async () => {
    restock.mockResolvedValue({ "item-Cod": "notAboveZero" });
    show([cod]);
    await press(button("Restock 1 ticked item"));
    await press(button("Restock 1 item", dialog()));

    await type(field("Cod"), "200");

    expect(text(dialog())).not.toContain("Enter an amount above 0.");
  });

  it("changes nothing on Cancel", async () => {
    show([beef]);
    await press(button("Restock 1 ticked item"));

    await press(button("Cancel", dialog()));

    expect(restock).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });
});
