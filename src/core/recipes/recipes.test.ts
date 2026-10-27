import { describe, expect, it } from "vitest";
import {
  applyCategoryOverrides,
  deriveFoodCategoryIds,
  parseCategoryOverrides,
  parseRecipeFields,
  toRecipeFieldsInput,
} from "./index";

const filled = {
  name: " Lasagne ",
  portions: "4",
  steps: "1. Layer\n2. Bake",
  prepTimeMinutes: "90",
  sourceUrl: " https://example.com/lasagne ",
};

describe("parseRecipeFields", () => {
  it("reads a fully filled-in form, trimming text", () => {
    expect(parseRecipeFields(filled)).toEqual({
      ok: true,
      fields: {
        name: "Lasagne",
        portions: 4,
        steps: "1. Layer\n2. Bake",
        prepTimeMinutes: 90,
        sourceUrl: "https://example.com/lasagne",
      },
    });
  });

  it("leaves the source URL unset and the steps blank when their fields are empty", () => {
    expect(parseRecipeFields({ ...filled, steps: "", sourceUrl: "" })).toMatchObject({
      ok: true,
      fields: { steps: "", sourceUrl: null },
    });
  });

  it.each([[""], ["   "]])("rejects a blank name (%j)", (name) => {
    expect(parseRecipeFields({ ...filled, name })).toEqual({ ok: false, errors: ["blankName"] });
  });

  // Portions are whole numbers everywhere (data-model T4).
  it.each([[""], ["0"], ["-2"], ["2.5"], ["four"], ["0x10"], ["Infinity"], ["2147483648"]])(
    "rejects Portions that are not a whole number above 0 (%j)",
    (portions) => {
      expect(parseRecipeFields({ ...filled, portions })).toEqual({ ok: false, errors: ["invalidPortions"] });
    },
  );

  it("accepts the most Portions the column holds", () => {
    expect(parseRecipeFields({ ...filled, portions: " 2147483647 " })).toMatchObject({
      ok: true,
      fields: { portions: 2147483647 },
    });
  });

  it.each([[""], ["  "], ["0"], ["-5"], ["1.5"], ["soon"]])("rejects a prep time that is not whole minutes above 0 (%j)", (prepTimeMinutes) => {
    expect(parseRecipeFields({ ...filled, prepTimeMinutes })).toEqual({ ok: false, errors: ["invalidPrepTime"] });
  });

  // The source URL is shown as a link, so only web addresses are accepted.
  it.each([["example.com"], ["not a url"], ["javascript:alert(1)"], ["ftp://example.com/file"]])(
    "rejects a source URL that is not an http(s) address (%j)",
    (sourceUrl) => {
      expect(parseRecipeFields({ ...filled, sourceUrl })).toEqual({ ok: false, errors: ["invalidSourceUrl"] });
    },
  );

  it("accepts an http source URL", () => {
    expect(parseRecipeFields({ ...filled, sourceUrl: "http://example.com" })).toMatchObject({
      ok: true,
      fields: { sourceUrl: "http://example.com" },
    });
  });

  it("reports every invalid field at once", () => {
    expect(
      parseRecipeFields({ name: "", portions: "0", steps: "", prepTimeMinutes: "x", sourceUrl: "x" }),
    ).toEqual({ ok: false, errors: ["blankName", "invalidPortions", "invalidPrepTime", "invalidSourceUrl"] });
  });
});

describe("toRecipeFieldsInput", () => {
  it("fills the form with a Recipe's current fields, and parses back to them", () => {
    const fields = {
      name: "Lasagne",
      portions: 4,
      steps: "Bake.",
      prepTimeMinutes: 90,
      sourceUrl: "https://example.com/lasagne",
    };

    expect(toRecipeFieldsInput(fields)).toEqual({
      name: "Lasagne",
      portions: "4",
      steps: "Bake.",
      prepTimeMinutes: "90",
      sourceUrl: "https://example.com/lasagne",
    });
    expect(parseRecipeFields(toRecipeFieldsInput(fields))).toEqual({ ok: true, fields });
  });

  it("leaves unset fields empty", () => {
    expect(
      toRecipeFieldsInput({ name: "Toast", portions: 1, steps: "", prepTimeMinutes: 5, sourceUrl: null }),
    ).toEqual({ name: "Toast", portions: "1", steps: "", prepTimeMinutes: "5", sourceUrl: "" });
  });
});

describe("deriveFoodCategoryIds", () => {
  it("is the union of the non-Minor Ingredients' Food Categories, each once", () => {
    const ids = deriveFoodCategoryIds([
      { minor: false, categoryIds: ["pasta", "main"] },
      { minor: false, categoryIds: ["red-meat", "main"] },
      { minor: true, categoryIds: ["vegetables"] },
    ]);

    expect(ids.sort()).toEqual(["main", "pasta", "red-meat"]);
  });

  it("is empty for a Recipe with no Ingredients, or only Minor ones", () => {
    expect(deriveFoodCategoryIds([])).toEqual([]);
    expect(deriveFoodCategoryIds([{ minor: true, categoryIds: ["vegetables"] }])).toEqual([]);
  });

  it("keeps a category a non-Minor Ingredient gives, even if a Minor one carries it too", () => {
    expect(
      deriveFoodCategoryIds([
        { minor: true, categoryIds: ["dairy"] },
        { minor: false, categoryIds: ["dairy"] },
      ]),
    ).toEqual(["dairy"]);
  });
});

describe("applyCategoryOverrides", () => {
  it("adds the \"add\" overrides to the derived set and takes out the \"remove\" ones", () => {
    const ids = applyCategoryOverrides(
      ["pasta", "red-meat", "dairy"],
      [
        { categoryId: "main", mode: "add" },
        { categoryId: "dairy", mode: "remove" },
      ],
    );

    expect(ids.sort()).toEqual(["main", "pasta", "red-meat"]);
  });

  it("is the derived set when there are no overrides", () => {
    expect(applyCategoryOverrides(["pasta", "main"], []).sort()).toEqual(["main", "pasta"]);
  });

  // The overrides are kept as set, so they still apply once the Ingredients change.
  it("ignores an \"add\" the Ingredients already give and a \"remove\" they don't", () => {
    const ids = applyCategoryOverrides(
      ["pasta"],
      [
        { categoryId: "pasta", mode: "add" },
        { categoryId: "dairy", mode: "remove" },
      ],
    );

    expect(ids).toEqual(["pasta"]);
  });
});

describe("parseCategoryOverrides", () => {
  it("reads the picked overrides, skipping categories left to follow the Ingredients", () => {
    expect(
      parseCategoryOverrides([
        { categoryId: "main", mode: "add" },
        { categoryId: "pasta", mode: "" },
        { categoryId: "dairy", mode: "remove" },
      ]),
    ).toEqual([
      { categoryId: "main", mode: "add" },
      { categoryId: "dairy", mode: "remove" },
    ]);
  });

  // The form only offers "add" and "remove", so anything else is a crafted request.
  it("throws on any other mode", () => {
    expect(() => parseCategoryOverrides([{ categoryId: "main", mode: "always" }])).toThrow(RangeError);
  });
});
