import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PlannerMeal, PlannerMealSlot, SlotPickers } from "./meal-card";
import { SlotPickerSheetView, startScreen } from "./slot-picker";

const text = (markup: string) =>
  markup.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

const slot = (overrides: Partial<PlannerMealSlot> = {}): PlannerMealSlot => ({
  id: "slot-1",
  slotCategoryId: "main",
  slotCategoryLabel: "Main Dish",
  slotCategoryArchived: false,
  food: { content: "empty" },
  warnings: null,
  ...overrides,
});

const meal = (overrides: Partial<PlannerMeal> = {}): PlannerMeal => ({
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
  slots: [slot()],
  addsBack: [],
  takes: { ok: true, products: [] },
  ...overrides,
});

const pickers: SlotPickers = {
  slotCategories: [
    { id: "main", label: "Main Dish", kind: "role" },
    { id: "side", label: "Side Dish", kind: "role" },
    { id: "dessert", label: "Dessert", kind: "role" },
    { id: "fish", label: "Fish", kind: "kind" },
  ],
  slotFoods: {
    recipes: [
      { id: "rice", label: "Rice bowl", portions: 2, categoryIds: ["main"] },
      { id: "curry", label: "Chicken curry", portions: 4, categoryIds: ["main"] },
      { id: "salad", label: "Green salad", portions: 2, categoryIds: ["side"] },
    ],
    products: [
      { id: "pizza", label: "Frozen pizza", defaultUnit: "pc", categoryIds: ["main"] },
      { id: "cod", label: "Cod", defaultUnit: "g", categoryIds: ["fish"] },
    ],
  },
};

type Props = ComponentProps<typeof SlotPickerSheetView>;
const render = (props: Partial<Props> = {}) =>
  renderToStaticMarkup(
    createElement(SlotPickerSheetView, {
      meal: meal(),
      slot: slot(),
      pickers,
      screen: { kind: "pick" },
      onScreen: () => {},
      onClose: () => {},
      ...props,
    }),
  );
const eyebrow = (html: string) => text(/<span class="sheet-eyebrow">(.*?)<\/span>/.exec(html)![1]!);
// Named buttons, leaving out the sheet's Close icon.
const buttons = (html: string) =>
  [...html.matchAll(/<button [^>]*>(.*?)<\/button>/g)].map((button) => text(button[1]!)).filter(Boolean);
const title = (html: string) => text(/<h2 [^>]*>(.*?)<\/h2>/.exec(html)![1]!);

describe("the slot picker", () => {
  it("is headed with the Meal, its day and hour, and what it picks for", () => {
    const html = render();
    expect(eyebrow(html)).toBe("Weekday Lunch · Fri 30 Oct · 12:30");
    expect(title(html)).toBe("Pick for Main Dish");
  });

  it("names the Meal by its Meal Type when it has no name", () => {
    expect(eyebrow(render({ meal: meal({ name: null }) }))).toBe("Lunch · Fri 30 Oct · 12:30");
  });

  it("shows the slot's pill, that only Recipes and Products carrying it show, and Change Slot Category", () => {
    const scope = /<div class="slot-picker-scope">(.*?)<\/div>/.exec(render())![1]!;
    expect(scope).toContain('<span class="pill">Main Dish</span>');
    expect(text(scope)).toBe("Slot Main Dish · only Recipes and Products carrying it Change Slot Category");
  });
});

describe("the slot picker's food", () => {
  const options = (html: string) =>
    [...html.matchAll(/<button [^>]*class="slot-picker-option[^"]*"[^>]*>(.*?)<\/button>/g)].map((option) => text(option[1]!));
  const sections = (html: string) => [...html.matchAll(/<h3[^>]*>(.*?)<\/h3>/g)].map((heading) => text(heading[1]!));

  it("offers Leftovers first, then every Recipe and Product carrying the category, by name", () => {
    expect(options(render())).toEqual([
      "Leftovers Deducts nothing from Stock",
      "Chicken curry Recipe · makes 4",
      "Frozen pizza Product · pc",
      "Rice bowl Recipe · makes 2",
    ]);
    expect(sections(render())).toEqual(["All · Main Dish"]);
  });

  it("doesn't offer Leftovers when the Meal Type doesn't allow them", () => {
    const html = render({ meal: meal({ allowsLeftovers: false }) });
    expect(options(html)).toEqual(["Chicken curry Recipe · makes 4", "Frozen pizza Product · pc", "Rice bowl Recipe · makes 2"]);
  });

  describe("when nothing carries the category", () => {
    const dessert = slot({ slotCategoryId: "dessert", slotCategoryLabel: "Dessert" });

    it("says so, offers New Recipe and New Product, then Leftovers", () => {
      const html = render({ slot: dessert });
      const empty = /<div class="slot-picker-empty">(.*?)<\/div>/.exec(html)![1]!;
      expect(text(/<p class="slot-picker-empty-title">(.*?)<\/p>/.exec(empty)![1]!)).toBe("Nothing is a Dessert yet");
      expect(text(empty)).toContain(
        "Give a Recipe or Product the Dessert Role and it shows up here. Archived ones never do.",
      );
      expect(empty).toMatch(/<a [^>]*href="\/recipes\/new"[^>]*>New Recipe<\/a>/);
      expect(empty).toMatch(/<a [^>]*href="\/products\/new"[^>]*>New Product<\/a>/);
      expect(options(html)).toEqual(["Leftovers Deducts nothing from Stock"]);
      expect(html.indexOf("slot-picker-empty")).toBeLessThan(html.indexOf("Leftovers"));
      expect(sections(html)).toEqual([]);
    });

    it("names a Kind as a Kind", () => {
      const fish = slot({ slotCategoryId: "fish", slotCategoryLabel: "Fish" });
      const html = render({ slot: fish, pickers: { ...pickers, slotFoods: { recipes: [], products: [] } } });
      expect(text(html)).toContain("Give a Recipe or Product the Fish Kind and it shows up here.");
    });
  });

  it("offers Empty when the slot holds something, Remove Slot and Cancel", () => {
    const buttons = (html: string) =>
      [.../<div class="sheet-actions slot-picker-foot">(.*?)<\/div>/.exec(html)![1]!.matchAll(/<button [^>]*>(.*?)<\/button>/g)].map(
        (button) => text(button[1]!),
      );
    expect(buttons(render())).toEqual(["Remove Slot", "Cancel"]);
    expect(buttons(render({ slot: slot({ food: { content: "leftovers" } }) }))).toEqual(["Empty", "Remove Slot", "Cancel"]);
  });
});

describe("how much of the picked food", () => {
  const field = (html: string) => /<input [^>]*name="amount"[^>]*>/.exec(html)![0];
  it("asks a Recipe's Portions, starting at the Recipe's own", () => {
    const html = render({ screen: { kind: "amount", content: "recipe", id: "curry" } });
    expect(title(html)).toBe("How many Portions?");
    expect(text(/<div class="slot-picker-picked">(.*?)<\/div>/.exec(html)![1]!)).toBe("Chicken curry Recipe · makes 4 Change");
    expect(field(html)).toContain('value="4"');
    expect(html).toMatch(/<input type="hidden" name="food" value="recipe:curry"/);
    expect(text(/<label [^>]*>(.*?)<\/label>/.exec(html)![1]!)).toBe("Portions");
  });

  it("steps a Recipe's Portions with - and +, saying the Recipe's own is the default", () => {
    const html = render({ screen: { kind: "amount", content: "recipe", id: "curry" } });
    const labels = [...html.matchAll(/<button [^>]*aria-label="([^"]*)"/g)].map((button) => button[1]);
    expect(labels).toEqual(expect.arrayContaining(["One portion less", "One portion more"]));
    expect(html.indexOf("One portion less")).toBeLessThan(html.indexOf('name="amount"'));
    expect(html.indexOf('name="amount"')).toBeLessThan(html.indexOf("One portion more"));
    expect(text(html)).toContain("The Recipe makes 4, so that's the default. Ingredients scale with Portions.");
  });

  it("asks a Product's quantity in its Default Unit, starting empty", () => {
    const html = render({ screen: { kind: "amount", content: "product", id: "pizza" } });
    expect(title(html)).toBe("How much?");
    expect(field(html)).toContain('value=""');
    expect(text(html)).toContain("Quantity pc");
  });

  it("names the Product's Default Unit on the picked food and under the field", () => {
    const html = render({ screen: { kind: "amount", content: "product", id: "pizza" } });
    expect(text(/<div class="slot-picker-picked">(.*?)<\/div>/.exec(html)![1]!)).toBe("Frozen pizza Product · Default Unit pc Change");
    expect(text(html)).toContain("In Frozen pizza's Default Unit.");
  });

  it("starts at what the slot holds when it holds the same food", () => {
    const held = slot({ food: { content: "product", id: "pizza", label: "Frozen pizza", quantity: 2, defaultUnit: "pc", archived: false } });
    expect(field(render({ slot: held, screen: { kind: "amount", content: "product", id: "pizza" } }))).toContain('value="2"');
  });

  it("offers Change on the picked food, then Back and Add to slot", () => {
    const html = render({ screen: { kind: "amount", content: "recipe", id: "curry" } });
    expect(buttons(html)).toEqual(["Change", "Back", "Add to slot"]);
    expect(/<div class="slot-picker-picked">.*?<\/div>/.exec(html)![0]).toMatch(/<button [^>]*>Change<\/button>/);
  });
});

describe("Change Slot Category", () => {
  const choices = (html: string) =>
    [...html.matchAll(/<label class="slot-category-choice[^"]*">(.*?)<\/label>/g)].map((choice) => ({
      text: text(choice[1]!),
      checked: /checked=""/.test(choice[1]!),
    }));

  it("lists the Roles and Kinds, with the slot's own marked now and picked", () => {
    const html = render({ screen: { kind: "category", fromPick: true } });
    expect(title(html)).toBe("Change Slot Category");
    expect(text(html)).toContain("Which Slot Category does this slot take?");
    expect(choices(html)).toEqual([
      { text: "Main Dish Role · now", checked: true },
      { text: "Side Dish Role", checked: false },
      { text: "Dessert Role", checked: false },
      { text: "Fish Kind", checked: false },
    ]);
  });

  it("says the food stays, with Cancel and Save", () => {
    const html = render({ screen: { kind: "category", fromPick: true } });
    expect(text(html)).toContain(
      "The food in it stays. From now on, only Recipes and Products carrying this category can fill the slot.",
    );
    expect(buttons(html)).toEqual(["Cancel", "Save"]);
  });

  it("is where the picker opens for a slot whose Slot Category is Archived", () => {
    expect(startScreen(slot({ slotCategoryArchived: true }))).toEqual({ kind: "category", fromPick: false });
    expect(startScreen(slot())).toEqual({ kind: "pick" });
  });

  it("picks nothing for a slot whose Slot Category is Archived", () => {
    const archived = slot({ slotCategoryId: "red-meat", slotCategoryLabel: "Red Meat", slotCategoryArchived: true });
    const html = render({ slot: archived, screen: { kind: "category", fromPick: false } });
    expect(choices(html).some((choice) => choice.checked || choice.text.includes("now"))).toBe(false);
  });
});
