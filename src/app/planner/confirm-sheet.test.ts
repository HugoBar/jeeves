import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConfirmMealSheet, type PlannerMeal, type PlannerMealSlot, type SlotPickers } from "./meal-card";

// Thursday 29 Oct 2026.
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
  slots: [
    slot("main", "Main Dish", { content: "recipe", id: "salmon", label: "Grilled salmon", portions: 2, archived: false }),
    slot("veg", "Vegetables", { content: "product", id: "spinach", label: "Spinach", quantity: 250, defaultUnit: "g", archived: false }),
    slot("left", "Side Dish", { content: "leftovers" }),
  ],
  addsBack: [],
  takes: { ok: true, products: [] },
  ...overrides,
});

const render = (overrides: Partial<PlannerMeal> = {}, notYet = false) =>
  renderToStaticMarkup(
    createElement(ConfirmMealSheet, { meal: meal(overrides), today, notYet, pickers, onClose: () => {} }),
  );

const text = (markup: string) =>
  markup.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

const slotRows = (html: string) =>
  [...html.matchAll(/<li class="(confirm-slot[^"]*)">(.*?)<\/li>/g)].map((row) => ({ className: row[1], text: text(row[2]!) }));

const outcomes = (html: string) =>
  [...html.matchAll(/<label class="confirm-outcome">(.*?)<\/label>/g)].map((label) => ({
    checked: /\schecked=""/.test(label[1]!),
    text: text(label[1]!),
  }));

const buttons = (html: string) => [...html.matchAll(/<button [^>]*>(.*?)<\/button>/g)].map((button) => text(button[1]!));

describe("the Confirm sheet", () => {
  it("is headed with Today, the Meal's day and hour, and Confirm {Meal}", () => {
    const html = render();
    expect(text(/<span class="sheet-eyebrow">(.*?)<\/span>/.exec(html)![1]!)).toBe("Today · Thu 29 Oct · 12:30");
    expect(text(/<h2 [^>]*>(.*?)<\/h2>/.exec(html)![1]!)).toBe("Confirm Weekday Lunch");
  });

  it("leaves Today out for an Unconfirmed Meal, and names a Meal with no name by its Meal Type", () => {
    const html = render({ date: "2026-10-27", name: null });
    expect(text(/<span class="sheet-eyebrow">(.*?)<\/span>/.exec(html)![1]!)).toBe("Tue 27 Oct · 12:30");
    expect(text(/<h2 [^>]*>(.*?)<\/h2>/.exec(html)![1]!)).toBe("Confirm Lunch");
  });

  it("lists what you ate, each slot with its pill, food, amount and Edit", () => {
    const html = render();
    expect(text(/<p class="confirm-slots-label">(.*?)<\/p>/.exec(html)![1]!)).toBe("What you ate · edit before confirming");
    expect(slotRows(html).map((row) => row.text)).toEqual([
      "Main Dish Grilled salmon 2 portions Edit",
      "Vegetables Spinach 250 g Edit",
      "Side Dish Leftovers Edit",
    ]);
  });

  it("dashes an empty slot and says it deducts nothing", () => {
    const html = render({ slots: [slot("side", "Side Dish", { content: "empty" })] });
    expect(slotRows(html)).toEqual([
      { className: "confirm-slot confirm-slot-empty", text: "Side Dish Empty Nothing chosen, so it deducts nothing. Edit" },
    ]);
  });

  it("offers the three outcomes with their helper text, Eaten as planned picked first", () => {
    expect(outcomes(render())).toEqual([
      { checked: true, text: "Eaten as planned Takes the food below from Stock." },
      {
        checked: false,
        text: "Eaten, but not from the Pantry Confirmed + Untracked. Nothing leaves Stock; it still counts as eaten.",
      },
      { checked: false, text: "Skipped Nothing was eaten. Stock doesn't change." },
    ]);
  });

  it("has Cancel and Confirm at its foot", () => {
    expect(buttons(render()).slice(-2)).toEqual(["Cancel", "Confirm"]);
  });

  it("asks first for a Meal later today, with Confirm anyway", () => {
    const html = render({ hour: "19:30" }, true);
    expect(text(/<div class="banner">(.*?)<\/div>/.exec(html)![1]!)).toBe(
      "This Meal hasn't happened yet. Confirm it anyway?",
    );
    expect(buttons(html).at(-1)).toBe("Confirm anyway");
  });
});
