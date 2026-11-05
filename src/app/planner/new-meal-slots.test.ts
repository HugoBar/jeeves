// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NewMealSlotsCard } from "./meal-card";

// React only flushes updates inside act() when told it runs in a test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type CardProps = ComponentProps<typeof NewMealSlotsCard>;

const pickers: CardProps["pickers"] = {
  slotCategories: [
    { id: "main", label: "Main Dish", kind: "role" },
    { id: "side", label: "Side Dish", kind: "role" },
    { id: "dessert", label: "Dessert", kind: "role" },
  ],
  slotFoods: {
    recipes: [{ id: "curry", label: "Chicken curry", portions: 4, categoryIds: ["main"] }],
    products: [{ id: "rice", label: "Basmati rice", defaultUnit: "g", categoryIds: ["side"] }],
  },
};

const added = [
  { food: "recipe:curry", amount: "4", slotCategoryId: "main" },
  { food: "product:rice", amount: "150", slotCategoryId: "side" },
  { food: "", amount: "", slotCategoryId: "dessert" },
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  // In a form, as on New Meal, so what it sends can be read back.
  act(() =>
    root.render(
      createElement("form", null, createElement(NewMealSlotsCard, { pickers, initial: added, onAddSlot: () => {} })),
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const press = (label: string) => act(() => button(label).click());
const sent = (name: string) => new FormData(container.querySelector("form")!).getAll(name);

describe("moving a slot on New Meal", () => {
  it("sends the slots in their new order, each keeping its food and amount", () => {
    press("Move Main Dish down");

    expect(sent("slotCategoryId")).toEqual(["side", "main", "dessert"]);
    expect(sent("slotFood")).toEqual(["product:rice", "recipe:curry", ""]);
    expect(sent("slotAmount")).toEqual(["150", "4", ""]);
  });

  it("disables ▲ on the slot that is now first, and ▼ on the one now last", () => {
    press("Move Dessert up");
    press("Move Dessert up");

    expect(button("Move Dessert up").disabled).toBe(true);
    expect(button("Move Side Dish down").disabled).toBe(true);
    expect(button("Move Main Dish up").disabled).toBe(false);
  });

  it("keeps the focus on the moved slot, on its other button once it can't move further", () => {
    button("Move Main Dish down").focus();
    press("Move Main Dish down");
    expect(document.activeElement).toBe(button("Move Main Dish down"));

    press("Move Main Dish down");
    expect(document.activeElement).toBe(button("Move Main Dish up"));
  });
});
