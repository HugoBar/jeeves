import { describe, expect, it } from "vitest";
import { parseIngredients, toIngredientInput, type PickableProduct } from "./index";

const products = new Map<string, PickableProduct>([
  ["flour", { name: "Flour", defaultUnit: "g", density: 0.53 }],
  ["salt", { name: "Salt", defaultUnit: "g", density: null }],
  ["milk", { name: "Milk", defaultUnit: "ml", density: null }],
  ["eggs", { name: "Eggs", defaultUnit: "pc", density: null }],
]);

const row = { productId: "flour", amount: "200", unit: "g", minor: false };

describe("parseIngredients", () => {
  it("reads the rows in the order entered", () => {
    expect(
      parseIngredients(
        [row, { productId: "eggs", amount: " 2 ", unit: "pc", minor: false }, { productId: "salt", amount: "1.5", unit: "g", minor: true }],
        products,
      ),
    ).toEqual({
      ok: true,
      ingredients: [
        { productId: "flour", amount: 200, unit: "g", minor: false },
        { productId: "eggs", amount: 2, unit: "pc", minor: false },
        { productId: "salt", amount: 1.5, unit: "g", minor: true },
      ],
    });
  });

  it("keeps amounts to the 2 decimals they are stored with", () => {
    expect(parseIngredients([{ ...row, amount: "0.125" }], products)).toMatchObject({
      ok: true,
      ingredients: [{ amount: 0.13 }],
    });
  });

  it.each([[""], ["0"], ["-1"], ["0.001"], ["lots"], ["100000000"]])(
    "refuses an amount that is not a decimal above 0 (%j), naming the Ingredient",
    (amount) => {
      expect(parseIngredients([{ ...row, amount }], products)).toEqual({
        ok: false,
        errors: [{ row: 1, code: "invalidAmount", product: "Flour" }],
      });
    },
  );

  it("accepts a volume for a Product counted by mass when it has a Density", () => {
    expect(parseIngredients([{ ...row, amount: "2", unit: "cup" }], products)).toMatchObject({ ok: true });
  });

  it("refuses a volume for a Product counted by mass without a Density, naming it", () => {
    expect(parseIngredients([row, { ...row, productId: "salt", amount: "1", unit: "tsp" }], products)).toEqual({
      ok: false,
      errors: [{ row: 2, code: "noDensity", product: "Salt", unit: "tsp", defaultUnit: "g" }],
    });
  });

  it("refuses a mass for a Product counted by volume without a Density", () => {
    expect(parseIngredients([{ ...row, productId: "milk", unit: "kg" }], products)).toEqual({
      ok: false,
      errors: [{ row: 1, code: "noDensity", product: "Milk", unit: "kg", defaultUnit: "ml" }],
    });
  });

  it("skips a row left blank, counting rows as the form shows them", () => {
    expect(
      parseIngredients([row, { productId: "", amount: " ", unit: "g", minor: false }, { ...row, amount: "0" }], products),
    ).toEqual({ ok: false, errors: [{ row: 3, code: "invalidAmount", product: "Flour" }] });
  });

  it("refuses an amount without a Product", () => {
    expect(parseIngredients([{ ...row, productId: "" }], products)).toEqual({
      ok: false,
      errors: [{ row: 1, code: "noProduct" }],
    });
  });

  // Such as one Archived after the form was loaded.
  it("refuses a Product that can't be picked", () => {
    expect(parseIngredients([{ ...row, productId: "rice" }], products)).toEqual({
      ok: false,
      errors: [{ row: 1, code: "unavailableProduct" }],
    });
  });

  it("reports every invalid Ingredient at once", () => {
    expect(
      parseIngredients([{ ...row, amount: "x" }, { ...row, productId: "eggs", unit: "cup" }], products),
    ).toMatchObject({ ok: false, errors: [{ row: 1, code: "invalidAmount" }, { row: 2, code: "countMismatch" }] });
  });

  // The form only offers the Recipe units.
  it("throws on a unit that is not a Recipe unit", () => {
    expect(() => parseIngredients([{ ...row, unit: "oz" }], products)).toThrow(RangeError);
  });

  // Count never converts, Density or not (spec "Units").
  it.each([
    ["a mass for a counted Product", "eggs", "g", "pc"],
    ["a count for a Product counted by mass", "flour", "pc", "g"],
  ])("refuses %s", (_, productId, unit, defaultUnit) => {
    const product = products.get(productId)!.name;
    expect(parseIngredients([{ ...row, productId, unit }], products)).toEqual({
      ok: false,
      errors: [{ row: 1, code: "countMismatch", product, unit, defaultUnit }],
    });
  });
});

describe("toIngredientInput", () => {
  it("fills a form row with an Ingredient, and parses back to it", () => {
    const ingredient = { productId: "flour", amount: 1.25, unit: "cup" as const, minor: true };

    expect(toIngredientInput(ingredient)).toEqual({ productId: "flour", amount: "1.25", unit: "cup", minor: true });
    expect(parseIngredients([toIngredientInput(ingredient)], products)).toEqual({ ok: true, ingredients: [ingredient] });
  });
});
