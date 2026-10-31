import { describe, expect, it } from "vitest";
import { densityBlockers, parseProductFields, toProductFieldsInput } from "./index";

const filled = {
  name: " Rice ",
  density: "0.85",
  packSizeName: " bag ",
  packSizeAmount: "1000",
  categoryIds: ["grains"],
};

describe("parseProductFields", () => {
  it("reads a fully filled-in form, trimming text", () => {
    expect(parseProductFields(filled)).toEqual({
      ok: true,
      fields: { name: "Rice", density: 0.85, packSize: { name: "bag", amount: 1000 }, categoryIds: ["grains"] },
    });
  });

  it("keeps each picked Food Category once", () => {
    expect(parseProductFields({ ...filled, categoryIds: ["fruit", "snack", "fruit"] })).toMatchObject({
      ok: true,
      fields: { categoryIds: ["fruit", "snack"] },
    });
  });

  it("leaves Density and Pack Size unset when their fields are empty", () => {
    expect(
      parseProductFields({ name: "Apple", density: " ", packSizeName: "", packSizeAmount: "", categoryIds: [] }),
    ).toEqual({ ok: true, fields: { name: "Apple", density: null, packSize: null, categoryIds: [] } });
  });

  it.each([[""], ["   "]])("rejects a blank name (%j)", (name) => {
    expect(parseProductFields({ ...filled, name })).toEqual({ ok: false, errors: ["blankName"] });
  });

  // Density is stored with 4 decimals (data-model T2): 0.00004 would be saved as 0.
  it.each([["abc"], ["0"], ["-1"], ["Infinity"], ["0.00004"], ["100000000"]])(
    "rejects a Density that is not a positive amount (%j)",
    (density) => {
      expect(parseProductFields({ ...filled, density })).toEqual({
        ok: false,
        errors: ["invalidDensity"],
      });
    },
  );

  it("rejects a Pack Size with a name but no amount", () => {
    expect(parseProductFields({ ...filled, packSizeName: "bag", packSizeAmount: "" })).toEqual({
      ok: false,
      errors: ["noPackSizeAmount"],
    });
  });

  it("rejects a Pack Size with an amount but no name", () => {
    expect(parseProductFields({ ...filled, packSizeName: " ", packSizeAmount: "1000" })).toEqual({
      ok: false,
      errors: ["noPackSizeName"],
    });
  });

  it.each([["0"], ["-5"], ["lots"]])("rejects a Pack Size amount that is not positive (%j)", (amount) => {
    expect(parseProductFields({ ...filled, packSizeAmount: amount })).toEqual({
      ok: false,
      errors: ["invalidPackSizeAmount"],
    });
  });

  it("rounds Density to 4 decimals and the Pack Size amount to 2, as stored", () => {
    expect(parseProductFields({ ...filled, density: "1.03456", packSizeAmount: "330.256" })).toMatchObject({
      ok: true,
      fields: { density: 1.0346, packSize: { amount: 330.26 } },
    });
  });

  it("reports every problem at once", () => {
    expect(
      parseProductFields({ name: "", density: "-1", packSizeName: "", packSizeAmount: "500", categoryIds: [] }),
    ).toEqual({ ok: false, errors: ["blankName", "invalidDensity", "noPackSizeName"] });
  });
});

describe("toProductFieldsInput", () => {
  it("fills the form with a Product's current fields", () => {
    expect(
      toProductFieldsInput({
        name: "Milk",
        density: 1.03,
        packSize: { name: "carton", amount: 1000 },
        categoryIds: ["dairy"],
      }),
    ).toEqual({ name: "Milk", density: "1.03", packSizeName: "carton", packSizeAmount: "1000", categoryIds: ["dairy"] });
  });

  it("leaves unset fields empty", () => {
    expect(toProductFieldsInput({ name: "Apple", density: null, packSize: null, categoryIds: [] })).toEqual({
      name: "Apple",
      density: "",
      packSizeName: "",
      packSizeAmount: "",
      categoryIds: [],
    });
  });
});

// Recipes are saved only with Ingredients that convert, so clearing a
// Density they convert with would leave them unconvertible (#69).
describe("densityBlockers", () => {
  const pancakes = { recipeName: "Pancakes", amount: 1, unit: "cup" as const };
  const bread = { recipeName: "Bread", amount: 500, unit: "g" as const };

  it("finds the Ingredients of a g Product written in a volume unit", () => {
    expect(densityBlockers("g", [pancakes, bread])).toEqual([pancakes]);
  });

  it("finds the Ingredients of an ml Product written in a mass unit", () => {
    const sauce = { recipeName: "Sauce", amount: 0.2, unit: "kg" as const };
    const soup = { recipeName: "Soup", amount: 1, unit: "l" as const };
    expect(densityBlockers("ml", [sauce, soup])).toEqual([sauce]);
  });

  it.each([["tsp"], ["tbsp"], ["ml"], ["l"]] as const)("counts %s as a volume unit", (unit) => {
    expect(densityBlockers("g", [{ recipeName: "Cake", amount: 1, unit }])).toHaveLength(1);
  });

  it("finds none when every Ingredient is in the Product's own dimension", () => {
    expect(densityBlockers("g", [bread, { recipeName: "Rolls", amount: 1, unit: "kg" }])).toEqual([]);
  });

  // Pieces never convert, so a pc Product's Density is never used.
  it("finds none for a pc Product", () => {
    expect(densityBlockers("pc", [{ recipeName: "Omelette", amount: 3, unit: "pc" }])).toEqual([]);
  });
});
