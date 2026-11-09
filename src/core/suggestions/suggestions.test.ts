import { describe, expect, it } from "vitest";
import type { ProjectedProduct } from "@/core/projected-stock";
import {
  suggestForSlot,
  type SuggestionCandidate,
  type SuggestionCategory,
  type SuggestionInput,
  type SuggestionMeal,
  type SuggestionSlot,
} from "./index";

// Monday 9 Nov 2026. Its week runs to Sunday 15 Nov.
const TODAY = "2026-11-09";

// Food Categories by id: two Roles and four Kinds.
const categories = new Map<string, SuggestionCategory>([
  ["main", { kind: "role", archived: false }],
  ["dessert", { kind: "role", archived: false }],
  ["red-meat", { kind: "kind", archived: false }],
  ["fish", { kind: "kind", archived: false }],
  ["fruit", { kind: "kind", archived: false }],
  ["grains", { kind: "kind", archived: false }],
]);

// Products by id, all in grams and none in Stock unless a test says so.
const noStock = (...ids: string[]) =>
  new Map<string, ProjectedProduct>(ids.map((id) => [id, { defaultUnit: "g", density: null, stock: 0 }]));
const PRODUCT_IDS = ["beef", "salmon", "rice", "apple", "pear", "salt"];

// A Recipe for 2 Portions needing 400 g of `productId` and a pinch of salt.
function aRecipe(id: string, productId: string, categoryIds: string[]): SuggestionCandidate {
  return {
    content: "recipe",
    id,
    categoryIds,
    recipe: {
      portions: 2,
      ingredients: [
        { productId, amount: 400, unit: "g", minor: false },
        { productId: "salt", amount: 2, unit: "g", minor: true },
      ],
    },
  };
}

const aProduct = (id: string, categoryIds: string[]): SuggestionCandidate => ({ content: "product", id, categoryIds });

const steak = aRecipe("steak", "beef", ["main", "red-meat"]);
const stew = aRecipe("stew", "beef", ["main", "red-meat"]);
const salmon = aRecipe("salmon", "salmon", ["main", "fish"]);
const risotto = aRecipe("risotto", "rice", ["main", "grains"]);
const apple = aProduct("apple", ["fruit"]);
const pear = aProduct("pear", ["fruit"]);

// An empty slot of `slotCategoryId`, the one Suggestions are asked for.
const emptySlot = (id: string, slotCategoryId: string): SuggestionSlot => ({
  id,
  content: "empty",
  slotCategoryId,
  food: null,
});

// A slot holding `food` at its own Portions, or 100 g of a Product.
function filledSlot(id: string, slotCategoryId: string, food: SuggestionCandidate): SuggestionSlot {
  const held = { id: food.id, categoryIds: food.categoryIds };
  if (food.content === "product") return { id, content: "product", productId: food.id, quantity: 100, slotCategoryId, food: held };
  return { id, content: "recipe", portions: food.recipe.portions, recipe: food.recipe, slotCategoryId, food: held };
}

// A tracked, Planned Dinner (Meal Priority 1) at 19:30 on `date`.
function aMeal(id: string, date: string, slots: SuggestionSlot[], fields: Partial<SuggestionMeal> = {}): SuggestionMeal {
  return {
    id,
    date,
    hour: "19:30",
    createdAt: new Date("2026-11-01T10:00:00Z"),
    priority: 1,
    status: "planned",
    untracked: false,
    slots,
    ...fields,
  };
}

// Suggestions for the empty slot "target" in a Dinner on `date`, among the
// other Meals given.
function suggest(
  slotCategoryId: string,
  candidates: SuggestionCandidate[],
  { date = TODAY, others = [], products = noStock(...PRODUCT_IDS), target = {}, ...rest }: Partial<
    Omit<SuggestionInput, "meals" | "candidates" | "slotId">
  > & { date?: string; others?: SuggestionMeal[]; target?: Partial<SuggestionMeal> } = {},
) {
  return suggestForSlot({
    slotId: "target",
    meals: [aMeal("target-meal", date, [emptySlot("target", slotCategoryId)], target), ...others],
    candidates,
    categories,
    products,
    today: TODAY,
    ...rest,
  });
}

const ids = (suggestions: { id: string }[]) => suggestions.map((suggestion) => suggestion.id);

describe("suggestForSlot", () => {
  it("offers only the Recipes and Products carrying the slot's Slot Category", () => {
    expect(ids(suggest("fruit", [steak, apple, salmon, pear]))).toEqual(["apple", "pear"]);
  });

  // When nothing tells them apart, they keep the order given.
  it("gives one Suggestion and 2 alternatives, best first", () => {
    expect(ids(suggest("main", [steak, stew, salmon, risotto]))).toEqual(["steak", "stew", "salmon"]);
  });

  describe("variety", () => {
    // Sunday 8 Nov, the day before the slot: 1 day apart, so weighed 7/8.
    const yesterday = (slotCategoryId: string, food: SuggestionCandidate, fields: Partial<SuggestionMeal> = {}) =>
      aMeal("yesterday", "2026-11-08", [filledSlot("eaten", slotCategoryId, food)], { status: "confirmed", ...fields });

    it("prefers fish in a Main Dish slot after steak yesterday", () => {
      const suggestions = suggest("main", [steak, stew, salmon, risotto], { others: [yesterday("main", steak)] });
      // Steak is the same item (-1) and shares Red Meat (-0.5); the stew
      // only shares Red Meat. Both are weighed 7/8 for being a day away.
      expect(suggestions).toEqual([
        { content: "recipe", id: "salmon", score: 0 },
        { content: "recipe", id: "risotto", score: 0 },
        { content: "recipe", id: "stew", score: -0.4375 },
      ]);
    });

    // Steak's score when steak was in another Main Dish slot: it is the
    // same item (1) and shares Red Meat (0.5), so 1.5 times how near it is.
    const steakScore = (eaten: SuggestionMeal) =>
      suggest("main", [steak, salmon], { others: [eaten] }).find((found) => found.id === "steak")!.score;
    const steakOn = (date: string, fields: Partial<SuggestionMeal> = {}) =>
      aMeal("other", date, [filledSlot("eaten", "main", steak)], fields);

    it.each([
      ["the same day", TODAY, -1.5],
      ["7 days before", "2026-11-02", -1.5 / 8],
      ["the Sunday of its week, still planned", "2026-11-15", -1.5 * (2 / 8)],
    ])("weighs steak on %s by how near it is", (_case, date, score) => {
      expect(steakScore(steakOn(date))).toBeCloseTo(score);
    });

    it.each([
      ["8 days before", "2026-11-01"],
      ["the Monday after its week", "2026-11-16"],
    ])("leaves out steak %s", (_case, date) => {
      expect(steakScore(steakOn(date))).toBe(0);
    });

    it("leaves out a Skipped Meal, but counts an Untracked or Unconfirmed one", () => {
      expect(steakScore(steakOn("2026-11-08", { status: "skipped" }))).toBe(0);
      expect(steakScore(steakOn("2026-11-08", { untracked: true }))).toBeCloseTo(-1.5 * (7 / 8));
      expect(steakScore(steakOn("2026-11-08", { status: "planned" }))).toBeCloseTo(-1.5 * (7 / 8));
    });

    it("compares only slots with the same Slot Category", () => {
      expect(steakScore(aMeal("other", TODAY, [filledSlot("eaten", "dessert", steak)]))).toBe(0);
    });

    it("counts another slot of the same Meal", () => {
      const suggestions = suggestForSlot({
        slotId: "target",
        meals: [aMeal("dinner", TODAY, [filledSlot("first", "main", steak), emptySlot("target", "main")])],
        candidates: [steak, salmon],
        categories,
        products: noStock(...PRODUCT_IDS),
        today: TODAY,
      });
      expect(ids(suggestions)).toEqual(["salmon", "steak"]);
    });

    it("ignores a Kind that is Archived when looking for shared Kinds", () => {
      const withArchived = new Map(categories).set("red-meat", { kind: "kind", archived: true });
      const suggestions = suggest("main", [stew, salmon], { others: [yesterday("main", steak)], categories: withArchived });
      expect(suggestions.find((found) => found.id === "stew")!.score).toBe(0);
    });

    // A Kind slot compares only the same item: a pear shares Fruit with the
    // apple, but in a Fruit slot every candidate is Fruit.
    it("prefers a pear in a Fruit slot after an apple yesterday", () => {
      const suggestions = suggest("fruit", [apple, pear], { others: [yesterday("fruit", apple)] });
      expect(suggestions).toEqual([
        { content: "product", id: "pear", score: 0 },
        { content: "product", id: "apple", score: -0.875 },
      ]);
    });
  });

  describe("Archived Food Categories", () => {
    it("gives no Suggestion for a slot whose Slot Category is Archived", () => {
      const withArchived = new Map(categories).set("main", { kind: "role", archived: true });
      expect(suggest("main", [steak, salmon], { categories: withArchived })).toEqual([]);
    });

    it("does not offer a food that carries the Slot Category only as an Archived one", () => {
      const withArchived = new Map(categories).set("fruit", { kind: "kind", archived: true });
      expect(suggestForSlot({
        slotId: "target",
        meals: [aMeal("m", TODAY, [emptySlot("target", "fruit")])],
        candidates: [apple],
        categories: withArchived,
        products: noStock(...PRODUCT_IDS),
        today: TODAY,
      })).toEqual([]);
    });
  });

  it("gives no Suggestion for a slot that already holds something", () => {
    const suggestions = suggestForSlot({
      slotId: "target",
      meals: [aMeal("m", TODAY, [filledSlot("target", "main", steak)])],
      candidates: [steak, salmon],
      categories,
      products: noStock(...PRODUCT_IDS),
      today: TODAY,
    });
    expect(suggestions).toEqual([]);
  });

  it("gives no Suggestion for a slot of a Confirmed or Skipped Meal", () => {
    expect(suggest("main", [steak], { target: { status: "confirmed" } })).toEqual([]);
    expect(suggest("main", [steak], { target: { status: "skipped" } })).toEqual([]);
  });

  describe("Stock coverage", () => {
    // Products in grams with the given Stock; any not listed has none.
    const stocked = (stock: Record<string, number>) => {
      const products = noStock(...PRODUCT_IDS, "potatoes", "oil");
      for (const [id, amount] of Object.entries(stock)) products.set(id, { defaultUnit: "g", density: null, stock: amount });
      return products;
    };
    const scoreOf = (suggestions: { id: string; score: number }[], id: string) =>
      suggestions.find((found) => found.id === id)!.score;

    // Steak is planned on Wednesday 11, 2 days from both Monday and Friday,
    // so variety costs it the same 1.5 x 6/8 = 1.125 either way. Beef is in
    // Stock (Wednesday leaves 1,600 g); salmon is not.
    it("ranks an out-of-stock food lower for today than for Friday", () => {
      const wednesday = aMeal("wednesday", "2026-11-11", [filledSlot("eaten", "main", steak)]);
      const options = { others: [wednesday], products: stocked({ beef: 2000 }) };

      // Today the full bonus, 2 x 1.0, outweighs it: 2 - 1.125 = 0.875.
      expect(suggest("main", [salmon, steak], options)).toEqual([
        { content: "recipe", id: "steak", score: 0.875 },
        { content: "recipe", id: "salmon", score: 0 },
      ]);
      // Friday is 4 days away, weighed 1 - 0.8 x 4/6: 2 x 0.4667 - 1.125.
      const friday = suggest("main", [salmon, steak], { ...options, date: "2026-11-13" });
      expect(ids(friday)).toEqual(["salmon", "steak"]);
      expect(scoreOf(friday, "steak")).toBeCloseTo(-0.1917, 4);
    });

    it.each([
      ["today", TODAY, 2],
      ["in 3 days", "2026-11-12", 2 * 0.6],
      ["in 6 days", "2026-11-15", 2 * 0.2],
      ["in 10 days", "2026-11-19", 2 * 0.2],
      ["on a day that has passed", "2026-11-06", 2],
    ])("weighs a fully covered food by how soon its Meal is: %s", (_case, date, score) => {
      expect(scoreOf(suggest("main", [steak], { date, products: stocked({ beef: 400 }) }), "steak")).toBeCloseTo(score);
    });

    // Sunday's Unconfirmed Dessert eats all 100 g of beef first.
    it("measures against Projected Stock, after the Meals served before", () => {
      const beef = aProduct("beef", ["dessert"]);
      const sunday = aMeal("sunday", "2026-11-08", [filledSlot("before", "dessert", beef)]);
      const products = stocked({ beef: 100 });
      expect(scoreOf(suggest("main", [steak], { products }), "steak")).toBeCloseTo(2 * (100 / 400));
      expect(scoreOf(suggest("main", [steak], { products, others: [sunday] }), "steak")).toBe(0);
    });

    it("counts a Product as covered when any of it is in Stock", () => {
      const suggestions = suggest("fruit", [apple, pear], { products: stocked({ pear: 1 }) });
      expect(suggestions).toEqual([
        { content: "product", id: "pear", score: 2 },
        { content: "product", id: "apple", score: 0 },
      ]);
    });

    it("gives no bonus in an Untracked Meal", () => {
      const suggestions = suggest("main", [steak], { products: stocked({ beef: 400 }), target: { untracked: true } });
      expect(scoreOf(suggestions, "steak")).toBe(0);
    });

    describe("of a Recipe", () => {
      // For 2 Portions, on Wednesday 11 (day weight 1 - 0.8 x 2/6). Beef is
      // covered, potatoes half, olive oil (Minor) covered, salt (Minor) not.
      const steakAndPotatoes: SuggestionCandidate = {
        content: "recipe",
        id: "steak-and-potatoes",
        categoryIds: ["main", "red-meat"],
        recipe: {
          portions: 2,
          ingredients: [
            { productId: "beef", amount: 400, unit: "g", minor: false },
            { productId: "potatoes", amount: 500, unit: "g", minor: false },
            { productId: "oil", amount: 15, unit: "g", minor: true },
            { productId: "salt", amount: 5, unit: "g", minor: true },
          ],
        },
      };
      const options = { date: "2026-11-11", products: stocked({ beef: 400, potatoes: 250, oil: 100 }) };
      const dayWeight = 1 - 0.8 * (2 / 6);

      it("averages how much of each Product's need is covered, leaving out Minor Ingredients", () => {
        // (1 + 0.5) / 2 = 0.75
        expect(scoreOf(suggest("main", [steakAndPotatoes], options), "steak-and-potatoes")).toBeCloseTo(
          2 * 0.75 * dayWeight,
        );
      });

      it("counts Minor Ingredients when told to", () => {
        // (1 + 0.5 + 1 + 0) / 4 = 0.625
        const suggestions = suggest("main", [steakAndPotatoes], { ...options, countMinorIngredients: true });
        expect(scoreOf(suggestions, "steak-and-potatoes")).toBeCloseTo(2 * 0.625 * dayWeight);
      });

      it("adds up a Product used by several Ingredients before comparing it with Stock", () => {
        const twice: SuggestionCandidate = {
          ...steakAndPotatoes,
          recipe: {
            portions: 2,
            ingredients: [
              { productId: "beef", amount: 300, unit: "g", minor: false },
              { productId: "beef", amount: 500, unit: "g", minor: false },
            ],
          },
        };
        // 400 g of the 800 g needed.
        expect(scoreOf(suggest("main", [twice], { products: stocked({ beef: 400 }) }), "steak-and-potatoes")).toBeCloseTo(
          2 * 0.5,
        );
      });

      // What such a Product needs is unknown, so it can't be counted on: a
      // Recipe with broken units must not outrank one that is half stocked.
      it("counts an Ingredient that can't be converted to its Product's Default Unit as not covered", () => {
        const withCup: SuggestionCandidate = {
          ...steakAndPotatoes,
          recipe: {
            portions: 2,
            ingredients: [
              { productId: "beef", amount: 400, unit: "g", minor: false },
              { productId: "rice", amount: 1, unit: "cup", minor: false },
            ],
          },
        };
        // (1 for the beef + 0 for the rice) / 2
        expect(scoreOf(suggest("main", [withCup], { products: stocked({ beef: 400, rice: 1000 }) }), "steak-and-potatoes")).toBe(
          2 * 0.5,
        );
      });

      it("counts a Recipe needing nothing from Stock as covered", () => {
        const nothing: SuggestionCandidate = { ...steakAndPotatoes, recipe: { portions: 2, ingredients: [] } };
        expect(scoreOf(suggest("main", [nothing]), "steak-and-potatoes")).toBe(2);
      });
    });
  });

  it("takes other weights when given", () => {
    const yesterday = aMeal("yesterday", "2026-11-08", [filledSlot("eaten", "main", steak)], { status: "confirmed" });
    const suggestions = suggest("main", [steak], {
      others: [yesterday],
      products: noStock(...PRODUCT_IDS),
      weights: { sameItem: 2, sharedKind: 1, coverage: 2 },
    });
    expect(suggestions[0]!.score).toBeCloseTo(-3 * (7 / 8));
  });
});
