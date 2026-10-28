import { describe, expect, it } from "vitest";
import {
  isPlanned,
  parseMealChanges,
  parseMealSlotCategory,
  parseNewMeal,
  parseMealSlotFill,
  parseNewMealFromTemplate,
  pickableForSlot,
  slotFoodValue,
  slotKeepsFood,
  sortMeals,
} from "./index";

// The Meal Types a new Meal can have in these tests.
const pickable = new Set(["lunch-id"]);

describe("parseNewMeal", () => {
  it("reads a filled-in form, trimming text", () => {
    expect(
      parseNewMeal({ date: "2026-10-27", hour: " 12:30 ", name: " Office Lunch ", mealTypeId: " lunch-id " }, pickable),
    ).toEqual({
      ok: true,
      fields: { date: "2026-10-27", hour: "12:30", name: "Office Lunch", mealTypeId: "lunch-id" },
    });
  });

  it.each([[""], ["   "]])("takes no name as none (%j), so the card shows the Meal Type", (name) => {
    expect(parseNewMeal({ date: "2026-10-27", hour: "12:30", name, mealTypeId: "lunch-id" }, pickable)).toMatchObject({
      ok: true,
      fields: { name: null },
    });
  });
});

describe("parseNewMeal rejects", () => {
  const filled = { date: "2026-10-27", hour: "12:30", name: "", mealTypeId: "lunch-id" };

  it.each([[""], ["24:00"], ["12:60"], ["7:30"], ["noon"]])("an hour that is not a time of day (%j)", (hour) => {
    expect(parseNewMeal({ ...filled, hour }, pickable)).toEqual({ ok: false, errors: ["invalidHour"] });
  });

  it.each([[""], ["  "]])("a missing Meal Type (%j)", (mealTypeId) => {
    expect(parseNewMeal({ ...filled, mealTypeId }, pickable)).toEqual({ ok: false, errors: ["noMealType"] });
  });

  // An Archived or deleted Meal Type, or a crafted id.
  it("a Meal Type it cannot have", () => {
    expect(parseNewMeal({ ...filled, mealTypeId: "archived-id" }, pickable)).toEqual({
      ok: false,
      errors: ["unavailableMealType"],
    });
  });

  // The day comes from the planner, never typed; anything else is crafted.
  it.each([[""], ["2026-13-01"], ["2026-02-30"], ["27/10/2026"]])("a date that is no day (%j)", (date) => {
    expect(parseNewMeal({ ...filled, date }, pickable)).toEqual({ ok: false, errors: ["invalidDate"] });
  });

  it("every invalid field at once", () => {
    expect(parseNewMeal({ date: "", hour: "", name: "", mealTypeId: "" }, pickable)).toEqual({
      ok: false,
      errors: ["invalidDate", "invalidHour", "noMealType"],
    });
  });
});

describe("parseNewMealFromTemplate", () => {
  // The Meal Templates that exist in these tests.
  const templates = new Set(["office-lunch-id"]);

  it("reads the planner day and the picked template", () => {
    expect(parseNewMealFromTemplate({ date: "2026-10-27", templateId: " office-lunch-id " }, templates)).toEqual({
      ok: true,
      fields: { date: "2026-10-27", templateId: "office-lunch-id" },
    });
  });

  it.each([[""], ["  "]])("rejects a missing template (%j)", (templateId) => {
    expect(parseNewMealFromTemplate({ date: "2026-10-27", templateId }, templates)).toEqual({
      ok: false,
      errors: ["noMealTemplate"],
    });
  });

  // Deleted since the planner loaded, or a crafted id.
  it("rejects a template that does not exist", () => {
    expect(parseNewMealFromTemplate({ date: "2026-10-27", templateId: "deleted-id" }, templates)).toEqual({
      ok: false,
      errors: ["unavailableMealTemplate"],
    });
  });

  it("rejects a date that is no day", () => {
    expect(parseNewMealFromTemplate({ date: "2026-02-30", templateId: "office-lunch-id" }, templates)).toEqual({
      ok: false,
      errors: ["invalidDate"],
    });
  });
});

describe("parseMealSlotCategory", () => {
  // The non-Archived Food Categories in these tests.
  const pickable = new Set(["grains-id"]);

  it("reads a picked Slot Category", () => {
    expect(parseMealSlotCategory(" grains-id ", pickable)).toEqual({ ok: true, slotCategoryId: "grains-id" });
  });

  it.each([[""], ["  "]])("rejects a missing Slot Category (%j)", (categoryId) => {
    expect(parseMealSlotCategory(categoryId, pickable)).toEqual({ ok: false, error: "noSlotCategory" });
  });

  // Archived since the planner loaded, or a crafted id. A slot keeps an
  // Archived one only until it is changed.
  it("rejects a Food Category that is Archived or gone", () => {
    expect(parseMealSlotCategory("archived-id", pickable)).toEqual({ ok: false, error: "unavailableSlotCategory" });
  });
});

describe("parseMealSlotFill", () => {
  // What a Lunch slot for Grains offers in these tests: Recipes and Products
  // carrying Grains, and Leftovers.
  const pickable = { recipeIds: new Set(["risotto-id"]), productIds: new Set(["bread-id"]), allowsLeftovers: true };

  it("reads a Recipe with its Portions", () => {
    expect(parseMealSlotFill({ food: " recipe:risotto-id ", amount: " 3 " }, pickable)).toEqual({
      ok: true,
      fill: { content: "recipe", recipeId: "risotto-id", portions: 3 },
    });
  });

  it("reads a Product with a quantity in its Default Unit, rounded as stored", () => {
    expect(parseMealSlotFill({ food: "product:bread-id", amount: "120.456" }, pickable)).toEqual({
      ok: true,
      fill: { content: "product", productId: "bread-id", quantity: 120.46 },
    });
  });

  it("reads Leftovers, ignoring any amount", () => {
    expect(parseMealSlotFill({ food: "leftovers", amount: "2" }, pickable)).toEqual({
      ok: true,
      fill: { content: "leftovers" },
    });
  });

  it("reads the option values the form builds", () => {
    expect(parseMealSlotFill({ food: slotFoodValue("recipe", "risotto-id"), amount: "2" }, pickable)).toMatchObject({
      ok: true,
      fill: { recipeId: "risotto-id" },
    });
    expect(parseMealSlotFill({ food: slotFoodValue("product", "bread-id"), amount: "2" }, pickable)).toMatchObject({
      ok: true,
      fill: { productId: "bread-id" },
    });
  });

  it.each([[""], ["  "]])("rejects nothing picked (%j)", (food) => {
    expect(parseMealSlotFill({ food, amount: "2" }, pickable)).toEqual({ ok: false, error: "noFood" });
  });

  it.each([["0"], ["-1"], ["1.5"], ["2.0"], [""], ["two"]])(
    "rejects Portions that are not a whole number above 0 (%j)",
    (amount) => {
      expect(parseMealSlotFill({ food: "recipe:risotto-id", amount }, pickable)).toEqual({
        ok: false,
        error: "invalidPortions",
      });
    },
  );

  it.each([["0"], ["-5"], [""], ["0.001"], ["lots"]])("rejects a quantity that is not above 0 (%j)", (amount) => {
    expect(parseMealSlotFill({ food: "product:bread-id", amount }, pickable)).toEqual({
      ok: false,
      error: "invalidQuantity",
    });
  });

  // Archived, not carrying the Slot Category, or a crafted value.
  it.each([["recipe:bread-id"], ["product:risotto-id"], ["recipe:archived-id"], ["recipe:"], ["dessert:cake-id"]])(
    "rejects food the slot does not offer (%j)",
    (food) => {
      expect(parseMealSlotFill({ food, amount: "2" }, pickable)).toEqual({ ok: false, error: "unavailableFood" });
    },
  );

  it("rejects Leftovers when the Meal Type does not allow them", () => {
    expect(parseMealSlotFill({ food: "leftovers", amount: "" }, { ...pickable, allowsLeftovers: false })).toEqual({
      ok: false,
      error: "unavailableFood",
    });
  });
});

describe("pickableForSlot", () => {
  it("keeps only the food carrying the Slot Category", () => {
    const foods = [
      { id: "risotto", categoryIds: ["grains", "vegetables"] },
      { id: "apple", categoryIds: ["fruit"] },
      { id: "water", categoryIds: [] },
    ];

    expect(pickableForSlot(foods, "grains").map((food) => food.id)).toEqual(["risotto"]);
  });
});

describe("slotKeepsFood", () => {
  it("keeps a Recipe or Product carrying the new Slot Category", () => {
    expect(slotKeepsFood("recipe", ["grains", "vegetables"], "vegetables")).toBe(true);
    expect(slotKeepsFood("product", ["fruit"], "fruit")).toBe(true);
  });

  it("drops a Recipe or Product not carrying it", () => {
    expect(slotKeepsFood("recipe", ["grains"], "fruit")).toBe(false);
    expect(slotKeepsFood("product", [], "fruit")).toBe(false);
  });

  // Leftovers have no Food Categories, so no Slot Category rules them out.
  it("keeps Leftovers and an empty slot whatever the Slot Category", () => {
    expect(slotKeepsFood("leftovers", [], "fruit")).toBe(true);
    expect(slotKeepsFood("empty", [], "fruit")).toBe(true);
  });
});

describe("parseMealChanges", () => {
  it("reads a new hour and name", () => {
    expect(parseMealChanges({ hour: "13:00", name: " Late Lunch " })).toEqual({
      ok: true,
      changes: { hour: "13:00", name: "Late Lunch" },
    });
  });

  it("clears the name when it is emptied", () => {
    expect(parseMealChanges({ hour: "13:00", name: " " })).toEqual({ ok: true, changes: { hour: "13:00", name: null } });
  });

  it("rejects an hour that is not a time of day", () => {
    expect(parseMealChanges({ hour: "", name: "Lunch" })).toEqual({ ok: false, errors: ["invalidHour"] });
  });
});

describe("sortMeals", () => {
  it("lists by hour, earliest first, then the Meal created first", () => {
    const meals = [
      { id: "dinner", hour: "19:30", createdAt: new Date("2026-10-20T10:00:00Z") },
      { id: "second-lunch", hour: "12:30", createdAt: new Date("2026-10-20T09:00:00Z") },
      { id: "breakfast", hour: "08:00", createdAt: new Date("2026-10-21T10:00:00Z") },
      { id: "first-lunch", hour: "12:30", createdAt: new Date("2026-10-20T08:00:00Z") },
    ];

    expect(sortMeals(meals).map((meal) => meal.id)).toEqual(["breakfast", "first-lunch", "second-lunch", "dinner"]);
  });
});

describe("isPlanned", () => {
  it("is true for a Planned Meal today or on a later day", () => {
    expect(isPlanned({ status: "planned", date: "2026-10-28" }, "2026-10-28")).toBe(true);
    expect(isPlanned({ status: "planned", date: "2026-11-02" }, "2026-10-28")).toBe(true);
  });

  // Unconfirmed: never stored, only Planned with a day that has passed
  // (data-model Q3).
  it("is false once the Meal's day has passed", () => {
    expect(isPlanned({ status: "planned", date: "2026-10-27" }, "2026-10-28")).toBe(false);
  });
});
