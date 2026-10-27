import { describe, expect, it } from "vitest";
import { parseMealTypeFields, sortMealTypes } from "./index";

describe("parseMealTypeFields", () => {
  it("reads a filled-in form, trimming text", () => {
    expect(parseMealTypeFields({ name: " Brunch ", priority: " 2 ", allowsLeftovers: true })).toEqual({
      ok: true,
      fields: { name: "Brunch", priority: 2, allowsLeftovers: true },
    });
  });
});

describe("parseMealTypeFields rejects", () => {
  const filled = { name: "Lunch", priority: "1", allowsLeftovers: false };

  it.each([[""], ["   "]])("a blank name (%j)", (name) => {
    expect(parseMealTypeFields({ ...filled, name })).toEqual({ ok: false, errors: ["blankName"] });
  });

  // 1 is the highest Meal Priority, so 0 and below mean nothing.
  it.each([[""], ["0"], ["-1"], ["1.5"], ["first"], ["2147483648"]])(
    "a Meal Priority that is not a whole number of at least 1 (%j)",
    (priority) => {
      expect(parseMealTypeFields({ ...filled, priority })).toEqual({ ok: false, errors: ["invalidPriority"] });
    },
  );

  it("every invalid field at once", () => {
    expect(parseMealTypeFields({ name: "", priority: "0", allowsLeftovers: true })).toEqual({
      ok: false,
      errors: ["blankName", "invalidPriority"],
    });
  });
});

describe("sortMealTypes", () => {
  it("lists by Meal Priority, 1 first, then alphabetically by the label shown, ignoring case", () => {
    const mealTypes = [
      { label: "Breakfast", priority: 2 },
      { label: "lunch", priority: 1 },
      { label: "Snack", priority: 3 },
      { label: "Dinner", priority: 1 },
    ];

    expect(sortMealTypes(mealTypes, (mealType) => mealType.label).map((mealType) => mealType.label)).toEqual([
      "Dinner",
      "lunch",
      "Breakfast",
      "Snack",
    ]);
  });
});
