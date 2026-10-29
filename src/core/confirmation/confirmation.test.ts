import { describe, expect, it } from "vitest";
import type { ProjectedRecipe, ProjectedSlot } from "@/core/projected-stock";
import type { ConvertibleProduct } from "@/core/units";
import { confirmationDeductions, confirmationsToReverse, staysSuspectAfterReopen, type ProductMovement } from "./index";

// Products by id: rice in grams, milk in millilitres (1.03 g/ml), eggs in
// pieces, flour in grams with no Density.
const products = new Map<string, ConvertibleProduct>([
  ["rice", { defaultUnit: "g", density: null }],
  ["milk", { defaultUnit: "ml", density: 1.03 }],
  ["eggs", { defaultUnit: "pc", density: null }],
  ["flour", { defaultUnit: "g", density: null }],
]);

// A Risotto for 4 Portions: 400 g rice, 0.5 l milk, 2 eggs (Minor).
const risotto: ProjectedRecipe = {
  portions: 4,
  ingredients: [
    { productId: "rice", amount: 400, unit: "g" },
    { productId: "milk", amount: 0.5, unit: "l" },
    { productId: "eggs", amount: 2, unit: "pc" },
  ],
};

describe("confirmationDeductions", () => {
  it("scales a Recipe's Ingredients by the slot's Portions over its own, in Default Units", () => {
    const slots: ProjectedSlot[] = [{ id: "a", content: "recipe", portions: 2, recipe: risotto }];
    expect(confirmationDeductions(slots, products)).toEqual({
      ok: true,
      deductions: [
        { productId: "rice", quantity: 200 },
        { productId: "milk", quantity: 250 },
        { productId: "eggs", quantity: 1 },
      ],
    });
  });

  it("sums each Product over the Meal's slots, one deduction per Product", () => {
    const slots: ProjectedSlot[] = [
      { id: "a", content: "recipe", portions: 4, recipe: risotto },
      { id: "b", content: "product", productId: "rice", quantity: 120.5 },
      { id: "c", content: "product", productId: "eggs", quantity: 1 },
    ];
    expect(confirmationDeductions(slots, products)).toEqual({
      ok: true,
      deductions: [
        { productId: "rice", quantity: 520.5 },
        { productId: "milk", quantity: 500 },
        { productId: "eggs", quantity: 3 },
      ],
    });
  });

  it("deducts nothing for empty and Leftovers slots", () => {
    const slots: ProjectedSlot[] = [
      { id: "a", content: "empty" },
      { id: "b", content: "leftovers" },
    ];
    expect(confirmationDeductions(slots, products)).toEqual({ ok: true, deductions: [] });
  });

  // 1 Portion of a 3-Portion Recipe using 100 g is 33.333... g: stored with
  // 2 decimals (data-model Q2), summed before rounding.
  it("rounds each Product's total to 2 decimals", () => {
    const thirds: ProjectedRecipe = { portions: 3, ingredients: [{ productId: "rice", amount: 100, unit: "g" }] };
    const slots: ProjectedSlot[] = [
      { id: "a", content: "recipe", portions: 1, recipe: thirds },
      { id: "b", content: "recipe", portions: 1, recipe: thirds },
    ];
    expect(confirmationDeductions(slots, products)).toEqual({
      ok: true,
      deductions: [{ productId: "rice", quantity: 66.67 }],
    });
  });

  it("refuses the whole Confirmation when an Ingredient cannot be converted", () => {
    const pancakes: ProjectedRecipe = {
      portions: 2,
      ingredients: [
        { productId: "milk", amount: 200, unit: "ml" },
        { productId: "flour", amount: 1, unit: "cup" },
      ],
    };
    const slots: ProjectedSlot[] = [
      { id: "a", content: "product", productId: "rice", quantity: 100 },
      { id: "b", content: "recipe", portions: 2, recipe: pancakes },
    ];
    expect(confirmationDeductions(slots, products)).toEqual({
      ok: false,
      unconvertible: { productId: "flour", amount: 1, unit: "cup", error: { code: "noDensity" } },
    });
  });
});

describe("confirmationsToReverse", () => {
  it("finds each Confirmation movement of the Meal", () => {
    expect(
      confirmationsToReverse([
        { productId: "rice", type: "confirmation", delta: -200 },
        { productId: "milk", type: "confirmation", delta: -250 },
      ]),
    ).toEqual([
      { productId: "rice", delta: -200 },
      { productId: "milk", delta: -250 },
    ]);
  });

  // A deduction past 0 recorded only what was removed, so only that comes
  // back. One from empty Stock removed nothing, but is still reversed.
  it("keeps what was actually removed after clamping", () => {
    expect(
      confirmationsToReverse([
        { productId: "rice", type: "confirmation", delta: -120 },
        { productId: "eggs", type: "confirmation", delta: 0 },
      ]),
    ).toEqual([
      { productId: "rice", delta: -120 },
      { productId: "eggs", delta: 0 },
    ]);
  });

  // Confirmed, Reopened, then Confirmed again with other quantities.
  it("leaves out Confirmations an earlier Reopen already reversed", () => {
    expect(
      confirmationsToReverse([
        { productId: "rice", type: "confirmation", delta: -200 },
        { productId: "milk", type: "confirmation", delta: -250 },
        { productId: "rice", type: "reopen", delta: 200 },
        { productId: "milk", type: "reopen", delta: 250 },
        { productId: "rice", type: "confirmation", delta: -300 },
      ]),
    ).toEqual([{ productId: "rice", delta: -300 }]);
  });

  it("finds nothing once every Confirmation is reversed", () => {
    expect(
      confirmationsToReverse([
        { productId: "rice", type: "confirmation", delta: -200 },
        { productId: "rice", type: "reopen", delta: 200 },
      ]),
    ).toEqual([]);
  });
});

describe("staysSuspectAfterReopen", () => {
  // One Product's history, oldest first.
  const restock: ProductMovement = { type: "restock", clamped: false, mealId: null };
  const correction: ProductMovement = { type: "correction", clamped: false, mealId: null };
  const clampedDiscard: ProductMovement = { type: "discard", clamped: true, mealId: null };
  const clampedLunch: ProductMovement = { type: "confirmation", clamped: true, mealId: "lunch" };

  it("clears the flag when the Confirmation being Reopened set it", () => {
    expect(staysSuspectAfterReopen([restock, clampedLunch], "lunch")).toBe(false);
  });

  // It was already wrong before the Confirmation, for another reason.
  it("keeps the flag a clamped Discard set before it", () => {
    expect(staysSuspectAfterReopen([clampedDiscard, clampedLunch], "lunch")).toBe(true);
  });

  it("keeps the flag a clamped Discard set after it", () => {
    expect(staysSuspectAfterReopen([clampedLunch, clampedDiscard], "lunch")).toBe(true);
  });

  it("keeps the flag another Meal's clamped Confirmation set, while that Meal is Confirmed", () => {
    const clampedDinner: ProductMovement = { type: "confirmation", clamped: true, mealId: "dinner" };
    expect(staysSuspectAfterReopen([clampedDinner, clampedLunch], "lunch")).toBe(true);
  });

  // That Meal was Reopened, so its clamp no longer explains the flag; nor
  // does one from a Meal removed since, which had to be Reopened first.
  it("ignores clamps of Confirmations already Reopened", () => {
    const reopenedDinner: ProductMovement[] = [
      { type: "confirmation", clamped: true, mealId: "dinner" },
      { type: "reopen", clamped: false, mealId: "dinner" },
    ];
    const removedMeal: ProductMovement = { type: "confirmation", clamped: true, mealId: null };
    expect(staysSuspectAfterReopen([...reopenedDinner, removedMeal, clampedLunch], "lunch")).toBe(false);
  });

  // Counting the Stock cleared the flag; anything before it no longer counts.
  it("ignores clamps before the last Correction", () => {
    expect(staysSuspectAfterReopen([clampedDiscard, correction, clampedLunch], "lunch")).toBe(false);
  });
});
