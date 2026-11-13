// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmMealSheet, type PlannerMeal, type PlannerMealSlot, type SlotPickers } from "./meal-card";

// React only flushes updates inside act() when told it runs in a test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The sheet imports the server actions; none is pressed here.
vi.mock("./actions", () => ({}));

const today = "2026-10-29";
const pickers: SlotPickers = { slotCategories: [], slotFoods: { recipes: [], products: [] } };

const slot = (id: string, slotCategoryLabel: string, food: PlannerMealSlot["food"]): PlannerMealSlot => ({
  id,
  slotCategoryId: id,
  slotCategoryLabel,
  slotCategoryArchived: false,
  food,
  warnings: null,
});

const salmon = slot("main", "Main Dish", { content: "recipe", id: "salmon", label: "Grilled salmon", portions: 2, archived: false });
const spinach = slot("veg", "Vegetables", { content: "product", id: "spinach", label: "Spinach", quantity: 250, defaultUnit: "g", archived: false });

const meal = (overrides: Partial<PlannerMeal> = {}): PlannerMeal => ({
  id: "meal-1",
  date: today,
  hour: "12:30",
  createdAt: new Date("2026-10-20T10:00:00Z"),
  name: "Weekday Lunch",
  mealTypeLabel: "Lunch",
  mealTypeArchived: false,
  allowsLeftovers: true,
  status: "planned",
  untracked: false,
  repeats: null,
  series: null,
  slots: [salmon, spinach],
  addsBack: [],
  takes: {
    ok: true,
    products: [
      { name: "Salmon fillet", defaultUnit: "g", needs: 300, takes: 300 },
      { name: "Olive oil", defaultUnit: "ml", needs: 15, takes: 15 },
      { name: "Spinach", defaultUnit: "g", needs: 250, takes: 150 },
      { name: "Rice", defaultUnit: "g", needs: 1800, takes: 1800 },
    ],
  },
  ...overrides,
});

let container: HTMLDivElement;
let root: Root;

const open = (shown = meal()) =>
  act(() => root.render(createElement(ConfirmMealSheet, { meal: shown, today, notYet: false, pickers, onClose: () => {} })));

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const sheet = () => container.querySelector<HTMLDialogElement>("dialog.confirm-sheet")!;
const pick = (name: string) =>
  act(() => {
    const label = [...sheet().querySelectorAll("label.confirm-outcome")].find((found) =>
      found.textContent!.startsWith(name),
    );
    label!.querySelector("input")!.click();
  });
const box = () => sheet().querySelector(".confirm-takes");
const boxLabel = () => box()!.querySelector(".confirm-takes-label")!.textContent;
const rows = () =>
  [...box()!.querySelectorAll(".confirm-take")].map((row) => ({
    short: row.classList.contains("confirm-take-short"),
    name: row.querySelector(".confirm-take-name")!.textContent,
    amount: row.querySelector(".confirm-take-amount")!.textContent,
  }));
const note = () => box()!.querySelector(".confirm-takes-note")?.textContent;

describe("the Confirm sheet's Takes from Stock box", () => {
  it("lists each Product and what Eaten as planned takes, as \"− 300 g\" and \"1,800 g\"", () => {
    open();
    expect(boxLabel()).toBe("Takes from Stock");
    expect(rows()).toEqual([
      { short: false, name: "Salmon fillet", amount: "− 300 g" },
      { short: false, name: "Olive oil", amount: "− 15 ml" },
      { short: true, name: "Spinach", amount: "− 150 g" },
      { short: false, name: "Rice", amount: "− 1,800 g" },
    ]);
  });

  it("says when a Product would go below 0, under its row", () => {
    open();
    const spinachRow = box()!.querySelector(".confirm-take-short")!;
    expect(spinachRow.querySelector(".confirm-take-warning")!.textContent).toBe(
      'Needs 250 g but only 150 g is in Stock. Spinach goes to 0 and is flagged "Stock was probably wrong".',
    );
    expect(box()!.querySelectorAll(".confirm-take-warning")).toHaveLength(1);
  });

  it("says nothing leaves Stock with \"Eaten, but not from the Pantry\"", () => {
    open();
    pick("Eaten, but not from the Pantry");
    expect(box()!.querySelector(".confirm-take-list")).toBeNull();
    expect(note()).toBe("Nothing leaves Stock. Suggestions still count it as eaten for variety.");
  });

  it("says the same for an Untracked Meal Eaten as planned, as it deducts nothing", () => {
    open(meal({ untracked: true }));
    expect(note()).toBe("Nothing leaves Stock. Suggestions still count it as eaten for variety.");
  });

  it("says Stock doesn't change with Skipped", () => {
    open();
    pick("Skipped");
    expect(note()).toBe("Stock doesn't change, and Suggestions don't count it as eaten.");
  });

  it("says why nothing would leave Stock: Leftovers and empty slots", () => {
    open(
      meal({
        slots: [slot("main", "Main Dish", { content: "leftovers" }), slot("side", "Side Dish", { content: "empty" })],
        takes: { ok: true, products: [] },
      }),
    );
    expect(note()).toBe("Nothing leaves Stock: Leftovers deduct nothing and Side Dish is empty.");
  });

  it("names every empty slot, and a Meal with no slots", () => {
    open(
      meal({
        slots: [slot("side", "Side Dish", { content: "empty" }), slot("salad", "Salad", { content: "empty" })],
        takes: { ok: true, products: [] },
      }),
    );
    expect(note()).toBe("Nothing leaves Stock: Side Dish and Salad are empty.");
    open(meal({ slots: [], takes: { ok: true, products: [] } }));
    expect(note()).toBe("Nothing leaves Stock: this Meal has no slots.");
  });

  it("names a Recipe with no Ingredients", () => {
    open(meal({ slots: [salmon, slot("side", "Side Dish", { content: "leftovers" })], takes: { ok: true, products: [] } }));
    expect(note()).toBe("Nothing leaves Stock: Leftovers deduct nothing and Grilled salmon has no Ingredients.");
  });

  it("says why Confirm would be refused before it is pressed", () => {
    open(
      meal({
        takes: {
          ok: false,
          error: "unconvertible",
          code: "noDensity",
          product: { name: "Honey", defaultUnit: "g" },
          amount: 2,
          unit: "tbsp",
        },
      }),
    );
    expect(note()).toBe(
      "Can't confirm: Honey has no Density, so 2 tbsp can't be converted to g. Add its Density or change the Ingredient's unit.",
    );
  });

  // A slot edited in the sheet refreshes the page, which hands it the Meal again.
  it("updates when the Meal comes back with a slot edited", () => {
    open();
    open(meal({ takes: { ok: true, products: [{ name: "Salmon fillet", defaultUnit: "g", needs: 450, takes: 450 }] } }));
    expect(rows()).toEqual([{ short: false, name: "Salmon fillet", amount: "− 450 g" }]);
  });
});
