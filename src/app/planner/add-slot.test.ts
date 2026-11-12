import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AddSlotSheetView, afterFood, backFrom } from "./add-slot";
import type { PlannerMeal, SlotPickers } from "./meal-card";

const text = (markup: string) =>
  markup.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

const meal: PlannerMeal = {
  id: "meal-1",
  date: "2026-10-30",
  hour: "12:30",
  createdAt: new Date("2026-10-20T10:00:00Z"),
  name: "Weekday Lunch",
  mealTypeLabel: "Lunch",
  mealTypeArchived: false,
  allowsLeftovers: true,
  status: "planned",
  untracked: false,
  repeats: null,
  slots: [],
  addsBack: [],
  takes: { ok: true, products: [] },
};

const pickers: SlotPickers = {
  slotCategories: [
    { id: "main", label: "Main Dish", kind: "role" },
    { id: "side", label: "Side Dish", kind: "role" },
    { id: "fish", label: "Fish", kind: "kind" },
    { id: "grain", label: "Grain", kind: "kind" },
  ],
  slotFoods: {
    recipes: [
      { id: "rice-bowl", label: "Rice bowl", portions: 2, categoryIds: ["main", "side", "grain"] },
      { id: "curry", label: "Chicken curry", portions: 4, categoryIds: ["main"] },
    ],
    products: [
      { id: "cod", label: "Cod", defaultUnit: "g", categoryIds: ["fish", "grain"] },
      { id: "oil", label: "Olive oil", defaultUnit: "ml", categoryIds: [] },
      { id: "banana", label: "banana", defaultUnit: "pc", categoryIds: ["side"] },
    ],
  },
};

type Props = ComponentProps<typeof AddSlotSheetView>;
const render = (props: Partial<Props> = {}) =>
  renderToStaticMarkup(
    createElement(AddSlotSheetView, {
      meal,
      pickers,
      screen: { kind: "food" },
      onScreen: () => {},
      add: async () => ({ error: null }),
      onClose: () => {},
      ...props,
    }),
  );
const title = (html: string) => text(/<h2 [^>]*>(.*?)<\/h2>/.exec(html)![1]!);
const eyebrow = (html: string) => text(/<span class="sheet-eyebrow">(.*?)<\/span>/.exec(html)![1]!);
// Named buttons, leaving out the sheet's Close icon.
const buttons = (html: string) =>
  [...html.matchAll(/<button [^>]*>(.*?)<\/button>/g)].map((button) => text(button[1]!)).filter(Boolean);

describe("Add a slot's food", () => {
  const options = (html: string) =>
    [...html.matchAll(/<button [^>]*class="slot-picker-option[^"]*"[^>]*>(.*?)<\/button>/g)].map((option) => text(option[1]!));

  it("is headed with the Meal, its day and hour, and Add a slot", () => {
    const html = render();
    expect(eyebrow(html)).toBe("Weekday Lunch · Fri 30 Oct · 12:30");
    expect(title(html)).toBe("Add a slot");
  });

  it("says the food comes first and lists every Recipe and Product by name, whatever it carries", () => {
    const html = render();
    expect(text(html)).toContain("Pick the food first. The slot then takes its Role, or its Kind if it has no Role.");
    expect(text(/<h3[^>]*>(.*?)<\/h3>/.exec(html)![1]!)).toBe("All Recipes and Products");
    expect(options(html)).toEqual([
      "banana Product · pc",
      "Chicken curry Recipe · makes 4",
      "Cod Product · g",
      "Olive oil Product · ml",
      "Rice bowl Recipe · makes 2",
    ]);
  });

  it("offers Cancel at its foot", () => {
    expect(buttons(render()).at(-1)).toBe("Cancel");
  });
});

describe("picking the food for a new slot", () => {
  it("goes on to how much when the food has one category, which the slot takes", () => {
    expect(afterFood("recipe:curry", pickers)).toEqual({
      kind: "amount",
      food: "recipe:curry",
      slotCategoryId: "main",
      from: "food",
    });
  });

  it("takes the food's Role over its Kinds", () => {
    expect(afterFood("product:banana", pickers)).toMatchObject({ kind: "amount", slotCategoryId: "side" });
  });

  it("asks which category when the food has several", () => {
    expect(afterFood("recipe:rice-bowl", pickers)).toEqual({ kind: "category", food: "recipe:rice-bowl" });
    expect(afterFood("product:cod", pickers)).toEqual({ kind: "category", food: "product:cod" });
  });

  it("says so when the food has no Food Category", () => {
    expect(afterFood("product:oil", pickers)).toEqual({ kind: "category", food: "product:oil" });
  });
});

describe("Add a slot's category, for food with several", () => {
  const several = { kind: "category" as const, food: "recipe:rice-bowl" };
  const choices = (html: string) =>
    [...html.matchAll(/<label class="slot-category-choice[^"]*">(.*?)<\/label>/g)].map((choice) => ({
      text: text(choice[1]!),
      checked: /checked=""/.test(choice[1]!),
    }));

  it("shows the picked food with its Roles, and Change", () => {
    const html = render({ screen: several });
    expect(title(html)).toBe("Add a slot");
    expect(text(/<div class="slot-picker-picked">(.*?)<\/div>/.exec(html)![1]!)).toBe(
      "Rice bowl Recipe · makes 2 · Roles: Main Dish, Side Dish Change",
    );
  });

  it("asks which one this slot is, with the first picked for you", () => {
    const html = render({ screen: several });
    expect(text(html)).toContain("Rice bowl is a Main Dish and a Side Dish. Which is this slot?");
    expect(choices(html)).toEqual([
      { text: "Main Dish Role · first, picked for you", checked: true },
      { text: "Side Dish Role", checked: false },
    ]);
    expect(text(html)).toContain("A new slot takes the Recipe or Product's Role. Only one with no Role uses its Kind.");
  });

  it("names Kinds as Kinds when the food has no Role", () => {
    const html = render({ screen: { kind: "category", food: "product:cod" } });
    expect(text(html)).toContain("Product · g · Kinds: Fish, Grain");
    expect(text(html)).toContain("Cod is a Fish and a Grain. Which is this slot?");
    expect(choices(html).map((choice) => choice.text)).toEqual(["Fish Kind · first, picked for you", "Grain Kind"]);
  });

  it("keeps the category picked before, when coming back to it from how much", () => {
    const html = render({ screen: { ...several, slotCategoryId: "side" } });
    expect(choices(html)).toEqual([
      { text: "Main Dish Role · first, picked for you", checked: false },
      { text: "Side Dish Role", checked: true },
    ]);
  });

  it("offers Back and Next", () => {
    expect(buttons(render({ screen: several }))).toEqual(["Change", "Back", "Next"]);
  });
});

describe("Add a slot, for food with no Food Category", () => {
  const none = { kind: "category" as const, food: "product:oil" };

  it("shows the picked food as having none, with Change", () => {
    expect(text(/<div class="slot-picker-picked">(.*?)<\/div>/.exec(render({ screen: none }))![1]!)).toBe(
      "Olive oil Product · ml · no Food Category Change",
    );
  });

  it("says it can't be added until it has one, with a link to open it", () => {
    const html = render({ screen: none });
    expect(text(html)).toContain(
      "That has no Food Category, or only Archived ones, so it cannot be added as a slot. Give it one first.",
    );
    expect(html).toMatch(/<a [^>]*href="\/products\/oil"[^>]*>Open Olive oil<\/a>/);
  });

  it("links a Recipe to its own page", () => {
    const plain = { ...pickers, slotFoods: { ...pickers.slotFoods, recipes: [{ id: "toast", label: "Toast", portions: 1, categoryIds: [] }] } };
    expect(render({ pickers: plain, screen: { kind: "category", food: "recipe:toast" } })).toMatch(
      /<a [^>]*href="\/recipes\/toast"[^>]*>Open Toast<\/a>/,
    );
  });

  // The planner offers only Food Categories that are not Archived.
  it("treats food carrying only Archived categories as having none", () => {
    const archivedOnly = {
      ...pickers,
      slotFoods: { ...pickers.slotFoods, products: [{ id: "veal", label: "Veal", defaultUnit: "g" as const, categoryIds: ["red-meat"] }] },
    };
    expect(afterFood("product:veal", archivedOnly)).toEqual({ kind: "category", food: "product:veal" });
    expect(text(render({ pickers: archivedOnly, screen: { kind: "category", food: "product:veal" } }))).toContain(
      "Veal Product · g · no Food Category",
    );
  });

  it("offers only Back, so it can't be added", () => {
    expect(buttons(render({ screen: none }))).toEqual(["Change", "Back"]);
  });
});

describe("how much goes in a new slot", () => {
  const amount = { kind: "amount" as const, food: "recipe:rice-bowl", slotCategoryId: "side", from: "category" as const };

  it("asks a Recipe's Portions for the category the slot takes", () => {
    const html = render({ screen: amount });
    expect(title(html)).toBe("How many Portions?");
    expect(/<p class="slot-picker-scope">(.*?)<\/p>/.exec(html)![1]).toContain('<span class="pill">Side Dish</span>');
    expect(/<input [^>]*name="amount"[^>]*>/.exec(html)![0]).toContain('value="2"');
  });

  it("sends the food and the category it takes", () => {
    const html = render({ screen: amount });
    expect(html).toMatch(/<input type="hidden" name="food" value="recipe:rice-bowl"/);
    expect(html).toMatch(/<input type="hidden" name="slotCategoryId" value="side"/);
  });

  it("asks a Product's quantity, starting empty", () => {
    const html = render({ screen: { kind: "amount", food: "product:banana", slotCategoryId: "side", from: "food" } });
    expect(title(html)).toBe("How much?");
    expect(/<input [^>]*name="amount"[^>]*>/.exec(html)![0]).toContain('value=""');
  });

  it("offers Change, Back and Add to slot", () => {
    expect(buttons(render({ screen: amount }))).toEqual(["Change", "Back", "Add to slot"]);
  });
});

describe("going back in Add a slot", () => {
  it("goes from how much back to where it came from, and Change to the food", () => {
    const amount = { food: "recipe:rice-bowl", slotCategoryId: "side" };
    expect(backFrom({ kind: "amount", ...amount, from: "category" })).toEqual({
      kind: "category",
      food: "recipe:rice-bowl",
      slotCategoryId: "side",
    });
    expect(backFrom({ kind: "amount", ...amount, from: "food" })).toEqual({ kind: "food" });
    expect(backFrom({ kind: "category", food: "recipe:rice-bowl" })).toEqual({ kind: "food" });
  });
});
