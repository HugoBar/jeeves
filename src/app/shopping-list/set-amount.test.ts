// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShoppingListItem } from "@/db/shopping-list";
import { setShoppingListItemAmountAction } from "./actions";
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
  setShoppingListItemAmountAction: vi.fn(),
}));
const setAmount = vi.mocked(setShoppingListItemAmountAction);

const item = (
  name: string,
  quantity: number | null,
  packSize: { name: string; amount: number } | null = null,
  ticked = false,
): ShoppingListItem => ({
  id: `item-${name}`,
  quantity,
  source: "shortfall",
  ticked,
  product: { id: `product-${name}`, name, defaultUnit: "g", packSize },
});

const spinach = item("Spinach", 100, { name: "bag", amount: 500 });
const salmon = item("Salmon fillet", 150);
const oats = item("Rolled oats", null, { name: "bag", amount: 500 });
const cod = item("Cod", null);
const beef = item("Ground beef", 300, { name: "pack", amount: 500 }, true);

let container: HTMLDivElement;
let root: Root;

const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
const press = (element: Element | null | undefined) =>
  act(async () => {
    (element as HTMLElement).click();
  });
const labelled = (label: string) => container.querySelector<HTMLElement>(`[aria-label="${label}"]`);
const row = (name: string) =>
  [...container.querySelectorAll("li")].find((found) => text(found.querySelector(".shopping-item-name")) === name);
const done = (name: string) =>
  press([...row(name)!.querySelectorAll("button")].find((found) => text(found) === "Done"));
const type = (input: HTMLElement | null, value: string) =>
  act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, value);
    input!.dispatchEvent(new Event("input", { bubbles: true }));
  });
const submit = (input: HTMLElement | null) =>
  act(async () => {
    input!.closest("form")!.requestSubmit();
  });

const show = (items: ShoppingListItem[]) =>
  act(() => root.render(createElement(ShoppingListView, { items, today: "2026-11-11", products: [], candidates: [], shortfalls: [] })));

beforeEach(() => {
  setAmount.mockReset().mockResolvedValue(null);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("setting an item's amount", () => {
  it("opens in place of the amount when tapped: − the packs +, its unit, then the amount", async () => {
    show([spinach]);
    const amount = labelled("Change the amount of Spinach");
    expect(text(amount)).toBe("1 bag (100 g)");

    await press(amount);

    expect(labelled("Change the amount of Spinach")).toBeNull();
    const stepper = row("Spinach")?.querySelector(".amount-stepper");
    const order = [...stepper!.children].map((child) => child.getAttribute("aria-label") ?? text(child));
    expect(order).toEqual(["Less Spinach", "Amount of Spinach", "More Spinach", "bag", "(100 g)"]);
    expect((labelled("Amount of Spinach") as HTMLInputElement).value).toBe("1");
  });

  it("shows Done in place of ✕ while open", async () => {
    show([spinach]);
    await press(labelled("Change the amount of Spinach"));

    expect(labelled("Remove Spinach")).toBeNull();
    expect(row("Spinach")?.classList.contains("shopping-item-editing")).toBe(true);
    await done("Spinach");

    expect(labelled("Remove Spinach")).not.toBeNull();
    expect(row("Spinach")?.classList.contains("shopping-item-editing")).toBe(false);
  });

  it("shows only the unit after + without a Pack Size", async () => {
    show([salmon]);
    await press(labelled("Change the amount of Salmon fillet"));

    expect(text(row("Salmon fillet")?.querySelector(".amount-stepper"))).toBe("g");
  });

  it("steps a whole pack at a time, never below 1 pack", async () => {
    show([spinach]);
    await press(labelled("Change the amount of Spinach"));

    expect(labelled("Less Spinach")?.hasAttribute("disabled")).toBe(true);
    await press(labelled("More Spinach"));

    expect(setAmount).toHaveBeenCalledWith("item-Spinach", "2");
  });

  it("steps from the packs shown", async () => {
    show([item("Whole milk", 1400, { name: "carton", amount: 1000 })]);
    await press(labelled("Change the amount of Whole milk"));

    await press(labelled("Less Whole milk"));

    expect(setAmount).toHaveBeenCalledWith("item-Whole milk", "1");
  });

  it("steps the amount in its Default Unit without a Pack Size", async () => {
    show([salmon]);
    await press(labelled("Change the amount of Salmon fillet"));
    expect((labelled("Amount of Salmon fillet") as HTMLInputElement).value).toBe("150");

    await press(labelled("More Salmon fillet"));
    expect(setAmount).toHaveBeenLastCalledWith("item-Salmon fillet", "250");

    show([item("Salmon fillet", 250)]);
    await press(labelled("Less Salmon fillet"));
    expect(setAmount).toHaveBeenLastCalledWith("item-Salmon fillet", "150");
  });

  it("sets the amount typed", async () => {
    show([salmon]);
    await press(labelled("Change the amount of Salmon fillet"));

    await type(labelled("Amount of Salmon fillet"), "600");
    await submit(labelled("Amount of Salmon fillet"));

    expect(setAmount).toHaveBeenCalledWith("item-Salmon fillet", "600");
  });

  it("sets the packs typed over the number, on leaving it", async () => {
    show([spinach]);
    await press(labelled("Change the amount of Spinach"));
    const field = labelled("Amount of Spinach");

    await type(field, "3");
    expect(text(row("Spinach")?.querySelector(".amount-stepper-unit"))).toBe("bags");
    await act(async () => field!.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));

    expect(setAmount).toHaveBeenCalledWith("item-Spinach", "3");
  });

  it("sends nothing when the number is left as it was", async () => {
    show([salmon]);
    await press(labelled("Change the amount of Salmon fillet"));

    await submit(labelled("Amount of Salmon fillet"));

    expect(setAmount).not.toHaveBeenCalled();
  });

  it("shows why the amount was refused on the server", async () => {
    setAmount.mockResolvedValue("notWholePacks");
    show([spinach]);
    await press(labelled("Change the amount of Spinach"));

    await type(labelled("Amount of Spinach"), "2");
    await submit(labelled("Amount of Spinach"));

    expect(text(row("Spinach"))).toContain("Enter a whole number of packs above 0.");
  });

  it("shows why a typed amount was refused, until it is changed", async () => {
    show([salmon]);
    await press(labelled("Change the amount of Salmon fillet"));
    const field = labelled("Amount of Salmon fillet");

    await type(field, "0");
    await submit(field);

    expect(text(row("Salmon fillet"))).toContain("Enter an amount above 0.");
    expect(field?.getAttribute("aria-invalid")).toBe("true");
    expect(setAmount).not.toHaveBeenCalled();

    await type(field, "60");
    expect(text(row("Salmon fillet"))).not.toContain("Enter an amount above 0.");
  });

  it("stays open while it is stepped, and the item is never highlighted", async () => {
    show([salmon]);
    await press(labelled("Change the amount of Salmon fillet"));

    await press(labelled("More Salmon fillet"));
    await press(labelled("More Salmon fillet"));
    expect(labelled("Amount of Salmon fillet")).not.toBeNull();

    await done("Salmon fillet");
    expect(row("Salmon fillet")?.classList.contains("shopping-item-fresh")).toBe(false);
  });

  it("closes with Escape", async () => {
    show([salmon]);
    await press(labelled("Change the amount of Salmon fillet"));

    await act(async () => {
      labelled("Amount of Salmon fillet")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(labelled("Amount of Salmon fillet")).toBeNull();
  });

  it("closes with Done", async () => {
    show([salmon]);
    await press(labelled("Change the amount of Salmon fillet"));

    await done("Salmon fillet");

    expect(labelled("Amount of Salmon fillet")).toBeNull();
  });

  it("gives an item with no amount one, starting at 1 pack", async () => {
    show([oats]);
    const amount = labelled("Change the amount of Rolled oats");
    expect(text(amount)).toBe("Set amount");
    await press(amount);

    expect((labelled("Amount of Rolled oats") as HTMLInputElement).value).toBe("");
    expect(labelled("Less Rolled oats")?.hasAttribute("disabled")).toBe(true);
    await press(labelled("More Rolled oats"));

    expect(setAmount).toHaveBeenCalledWith("item-Rolled oats", "1");
  });

  it("gives an item with no amount and no Pack Size one, typed or stepped", async () => {
    show([cod]);
    await press(labelled("Change the amount of Cod"));
    expect((labelled("Amount of Cod") as HTMLInputElement).value).toBe("");

    await press(labelled("More Cod"));
    expect(setAmount).toHaveBeenLastCalledWith("item-Cod", "100");

    await type(labelled("Amount of Cod"), "600");
    await submit(labelled("Amount of Cod"));
    expect(setAmount).toHaveBeenLastCalledWith("item-Cod", "600");
  });

  it("can't change a ticked item's amount", () => {
    show([beef]);

    expect(labelled("Change the amount of Ground beef")).toBeNull();
    expect(text(row("Ground beef"))).toContain("1 pack (300 g)");
  });
});
