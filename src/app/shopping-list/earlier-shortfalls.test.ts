// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatedShortfall, DatedUnknown } from "@/core/shopping-list";
import { ShoppingListView } from "./shopping-list";

// React only flushes updates inside act() when told it runs in a test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("./actions", () => ({
  removeShoppingListItemAction: vi.fn(),
  generateShoppingListAction: vi.fn(),
  setShoppingListItemTickedAction: vi.fn(),
  setAllShoppingListItemsTickedAction: vi.fn(),
  setShoppingListItemAmountAction: vi.fn(),
  restockTickedItemsAction: vi.fn(),
}));

// Wednesday 11 Nov 2026: the planned week runs 9-15 Nov, the next 16-22 Nov.
const shortfallProducts = [
  { id: "garlic", name: "Garlic", defaultUnit: "pc" as const },
  { id: "onion", name: "Onion", defaultUnit: "pc" as const },
  { id: "flour", name: "Flour", defaultUnit: "g" as const },
];

let container: HTMLDivElement;
let root: Root;

const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
const card = () => container.querySelector(".shopping-generate");
const note = () => text(card()?.querySelector(".shopping-earlier"));
const press = (element: Element | null | undefined) =>
  act(async () => {
    (element as HTMLElement).click();
  });
const button = (label: string) => [...container.querySelectorAll("button")].find((found) => text(found).startsWith(label));

const show = (shortfalls: DatedShortfall[], unknownNeeds: DatedUnknown[] = []) =>
  act(() =>
    root.render(
      createElement(ShoppingListView, {
        items: [],
        today: "2026-11-11",
        products: [],
        candidates: [],
        shortfalls,
        unknownNeeds,
        shortfallProducts,
      }),
    ),
  );

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("what earlier Meals are short of, on the Generate card", () => {
  it("names each Product short both before and within the chosen dates, with its earlier Shortfall, A to Z", () => {
    show([
      { productId: "onion", date: "2026-11-05", amount: 2 },
      { productId: "garlic", date: "2026-11-03", amount: 2 },
      { productId: "garlic", date: "2026-11-06", amount: 4 },
      { productId: "garlic", date: "2026-11-14", amount: 3 },
      { productId: "onion", date: "2026-11-10", amount: 1 },
    ]);

    expect(note()).toBe("Earlier Meals are short too: Garlic 6 pc, Onion 2 pc");
  });

  it("names neither a Product short only earlier nor one short only within the dates", () => {
    show([
      { productId: "onion", date: "2026-11-05", amount: 2 },
      { productId: "garlic", date: "2026-11-14", amount: 3 },
    ]);

    expect(card()?.querySelector(".shopping-earlier")).toBeNull();
  });

  it("names no Product Generate leaves out for the dates", () => {
    show(
      [
        { productId: "flour", date: "2026-11-05", amount: 200 },
        { productId: "flour", date: "2026-11-12", amount: 100 },
      ],
      [{ productId: "flour", date: "2026-11-13" }],
    );

    expect(card()?.querySelector(".shopping-earlier")).toBeNull();
  });

  it("follows the chosen dates as they change, before Generate is pressed", async () => {
    show([
      { productId: "garlic", date: "2026-11-12", amount: 6 },
      { productId: "garlic", date: "2026-11-21", amount: 3 },
    ]);
    expect(card()?.querySelector(".shopping-earlier")).toBeNull();

    await press(button("Planned week"));
    await press(container.querySelector('input[value="next"]'));
    await press(button("Use these dates"));

    expect(note()).toBe("Earlier Meals are short too: Garlic 6 pc");
  });
});
