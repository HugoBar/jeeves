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
  it.each([[""], ["0"], ["-1"], ["1.5"], ["first"]])(
    "a Meal Priority that is not a whole number of at least 1 (%j)",
    (priority) => {
      expect(parseMealTypeFields({ ...filled, priority })).toEqual({ ok: false, errors: ["invalidPriority"] });
    },
  );

  it("a Meal Priority past what the column holds, as too large", () => {
    expect(parseMealTypeFields({ ...filled, priority: "2147483648" })).toEqual({
      ok: false,
      errors: ["priorityTooLarge"],
    });
  });

  it("every invalid field at once", () => {
    expect(parseMealTypeFields({ name: "", priority: "0", allowsLeftovers: true })).toEqual({
      ok: false,
      errors: ["blankName", "invalidPriority"],
    });
  });
});

describe("sortMealTypes", () => {
  const label = (mealType: { label: string }) => mealType.label;
  const seeds = [
    { id: "d", seedKey: "dinner", label: "Dinner" },
    { id: "s", seedKey: "snack", label: "Snack" },
    { id: "l", seedKey: "lunch", label: "Lunch" },
    { id: "b", seedKey: "breakfast", label: "Breakfast" },
  ] as const;
  const labels = (sorted: readonly { label: string }[]) => sorted.map(label);

  it("lists the seeds with no Meals in the order of a day", () => {
    expect(labels(sortMealTypes(seeds, new Map(), label))).toEqual(["Breakfast", "Lunch", "Snack", "Dinner"]);
  });

  it("places a Meal Type with Meals by their usual hour, over a seed's default", () => {
    const brunch = { id: "br", seedKey: null, label: "Brunch" };
    // Dinner's Meals are at 12:00, so it moves before Lunch's default 13:00.
    const usual = new Map([
      ["br", 10 * 60 + 30],
      ["d", 12 * 60],
    ]);

    expect(labels(sortMealTypes([...seeds, brunch], usual, label))).toEqual([
      "Breakfast",
      "Brunch",
      "Dinner",
      "Lunch",
      "Snack",
    ]);
  });

  it("lists added Meal Types with no Meals last, by name ignoring case", () => {
    const added = [
      { id: "x", seedKey: null, label: "supper" },
      { id: "y", seedKey: null, label: "Elevenses" },
    ];

    expect(labels(sortMealTypes([...added, ...seeds], new Map(), label))).toEqual([
      "Breakfast",
      "Lunch",
      "Snack",
      "Dinner",
      "Elevenses",
      "supper",
    ]);
  });

  it("breaks a tie on the usual hour by name", () => {
    const tea = { id: "t", seedKey: null, label: "Afternoon Tea" };

    expect(labels(sortMealTypes([...seeds, tea], new Map([["t", 16 * 60]]), label))).toEqual([
      "Breakfast",
      "Lunch",
      "Afternoon Tea",
      "Snack",
      "Dinner",
    ]);
  });
});

describe("parseMealTypeFields name length", () => {
  it("refuses a name over 100 characters", () => {
    expect(parseMealTypeFields({ name: "a".repeat(101), priority: "1", allowsLeftovers: false })).toEqual({
      ok: false,
      errors: ["nameTooLong"],
    });
  });
});
