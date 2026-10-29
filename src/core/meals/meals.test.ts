import { describe, expect, it } from "vitest";
import {
  canChangeMeal,
  canReopen,
  isUnconfirmed,
  needingConfirmation,
  weekToClose,
  mustResolve,
  canConfirmOrSkip,
  parseMealChanges,
  parseMealSlotCategory,
  parseNewMeal,
  parseMealSlotFill,
  parseNewMealFromTemplate,
  parseNewMealSlot,
  pickableForSlot,
  confirmOrSkipAsksFirst,
  slotCategoryChoices,
  slotFoodValue,
  slotKeepsFood,
  sortMeals,
  sortMealsByDay,
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

describe("slotCategoryChoices", () => {
  // The non-Archived Food Categories, in the order the chooser lists them.
  const categories = [
    { id: "main", kind: "role" },
    { id: "side", kind: "role" },
    { id: "fish", kind: "kind" },
    { id: "grains", kind: "kind" },
  ] as const;

  it("offers the food's Roles, in the chooser's order, leaving its Kinds out", () => {
    expect(slotCategoryChoices(["grains", "side", "fish", "main"], categories).map((c) => c.id)).toEqual([
      "main",
      "side",
    ]);
  });

  it("offers the food's Kinds when it has no Role", () => {
    expect(slotCategoryChoices(["grains", "fish"], categories).map((c) => c.id)).toEqual(["fish", "grains"]);
  });

  // An Archived one is not among the categories, so food carrying only
  // Archived ones has none to offer.
  it("never offers a Food Category that is not listed, such as an Archived one", () => {
    expect(slotCategoryChoices(["archived-role", "grains"], categories).map((c) => c.id)).toEqual(["grains"]);
    expect(slotCategoryChoices(["archived-role"], categories)).toEqual([]);
  });

  it("offers nothing for food with no Food Categories", () => {
    expect(slotCategoryChoices([], categories)).toEqual([]);
  });
});

describe("parseNewMealSlot", () => {
  // What adding a slot offers in these tests: every non-Archived Recipe and
  // Product, each with the Slot Categories it can give the slot.
  const pickable = {
    recipes: new Map([
      ["risotto-id", ["main-id", "side-id"]],
      ["water-recipe-id", []],
    ]),
    products: new Map([["bread-id", ["grains-id"]]]),
  };

  it("reads a Recipe with its Portions and the Slot Category chosen", () => {
    expect(
      parseNewMealSlot({ food: " recipe:risotto-id ", amount: " 3 ", slotCategoryId: " side-id " }, pickable),
    ).toEqual({
      ok: true,
      slot: { slotCategoryId: "side-id", fill: { content: "recipe", recipeId: "risotto-id", portions: 3 } },
    });
  });

  it("reads a Product with a quantity", () => {
    expect(parseNewMealSlot({ food: "product:bread-id", amount: "120", slotCategoryId: "grains-id" }, pickable)).toEqual(
      {
        ok: true,
        slot: { slotCategoryId: "grains-id", fill: { content: "product", productId: "bread-id", quantity: 120 } },
      },
    );
  });

  // The chooser only shows with several choices, pre-selecting the first.
  it.each([[""], ["  "]])("takes the first choice when none is sent (%j)", (slotCategoryId) => {
    expect(parseNewMealSlot({ food: "recipe:risotto-id", amount: "2", slotCategoryId }, pickable)).toMatchObject({
      ok: true,
      slot: { slotCategoryId: "main-id" },
    });
  });

  // Not the food's Role or Kind, Archived since the planner loaded, or crafted.
  it("rejects a Slot Category the food does not offer", () => {
    expect(
      parseNewMealSlot({ food: "recipe:risotto-id", amount: "2", slotCategoryId: "grains-id" }, pickable),
    ).toEqual({ ok: false, error: "unavailableSlotCategory" });
  });

  it("rejects food with no non-Archived Food Categories", () => {
    expect(
      parseNewMealSlot({ food: "recipe:water-recipe-id", amount: "2", slotCategoryId: "" }, pickable),
    ).toEqual({ ok: false, error: "uncategorisedFood" });
  });

  // Leftovers have no Food Categories, so they only fill an existing slot.
  it.each([["leftovers"], ["recipe:archived-id"], ["product:risotto-id"]])(
    "rejects Leftovers and food not offered (%j)",
    (food) => {
      expect(parseNewMealSlot({ food, amount: "2", slotCategoryId: "main-id" }, pickable)).toEqual({
        ok: false,
        error: "unavailableFood",
      });
    },
  );

  it("rejects nothing picked", () => {
    expect(parseNewMealSlot({ food: "", amount: "", slotCategoryId: "" }, pickable)).toEqual({
      ok: false,
      error: "noFood",
    });
  });

  it("rejects an amount the fill would", () => {
    expect(parseNewMealSlot({ food: "recipe:risotto-id", amount: "0", slotCategoryId: "" }, pickable)).toEqual({
      ok: false,
      error: "invalidPortions",
    });
    expect(parseNewMealSlot({ food: "product:bread-id", amount: "", slotCategoryId: "" }, pickable)).toEqual({
      ok: false,
      error: "invalidQuantity",
    });
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

  // As lists of Meals across days, such as "Needs confirmation", show them.
  it("lists earlier days first", () => {
    const createdAt = new Date("2026-10-20T08:00:00Z");
    const meals = [
      { id: "tuesday-breakfast", date: "2026-10-20", hour: "08:00", createdAt },
      { id: "monday-dinner", date: "2026-10-19", hour: "19:30", createdAt },
    ];

    expect(sortMealsByDay(meals).map((meal) => meal.id)).toEqual(["monday-dinner", "tuesday-breakfast"]);
  });
});

describe("canConfirmOrSkip", () => {
  it("allows Confirming or Skipping a Meal today or on a day that has passed", () => {
    expect(canConfirmOrSkip({ status: "planned", date: "2026-10-28" }, "2026-10-28")).toBe(true);
    expect(canConfirmOrSkip({ status: "planned", date: "2026-10-20" }, "2026-10-28")).toBe(true);
  });

  it("refuses a Meal on a later day", () => {
    expect(canConfirmOrSkip({ status: "planned", date: "2026-10-29" }, "2026-10-28")).toBe(false);
  });

  it("refuses a Meal already Confirmed or Skipped", () => {
    expect(canConfirmOrSkip({ status: "confirmed", date: "2026-10-27" }, "2026-10-28")).toBe(false);
    expect(canConfirmOrSkip({ status: "skipped", date: "2026-10-27" }, "2026-10-28")).toBe(false);
  });

  // A crafted request: without a real date the Meal's day cannot be checked.
  it.each([[""], ["tomorrow"], ["2026-13-01"]])("refuses when today is not a date (%j)", (today) => {
    expect(canConfirmOrSkip({ status: "planned", date: "2026-10-20" }, today)).toBe(false);
  });
});

describe("confirmOrSkipAsksFirst", () => {
  const now = { date: "2026-10-28", hour: "13:00" };

  // It may not have happened yet.
  it("asks before Confirming or Skipping a Meal later today", () => {
    expect(confirmOrSkipAsksFirst({ date: "2026-10-28", hour: "19:30" }, now)).toBe(true);
  });

  it("does not ask for a Meal earlier today, at this hour, or on a day that has passed", () => {
    expect(confirmOrSkipAsksFirst({ date: "2026-10-28", hour: "12:30" }, now)).toBe(false);
    expect(confirmOrSkipAsksFirst({ date: "2026-10-28", hour: "13:00" }, now)).toBe(false);
    expect(confirmOrSkipAsksFirst({ date: "2026-10-27", hour: "19:30" }, now)).toBe(false);
  });
});

describe("canReopen", () => {
  it("allows Reopening a Confirmed or Skipped Meal", () => {
    expect(canReopen({ status: "confirmed" })).toBe(true);
    expect(canReopen({ status: "skipped" })).toBe(true);
  });

  it("refuses a Planned or Unconfirmed Meal", () => {
    expect(canReopen({ status: "planned" })).toBe(false);
  });
});

describe("canChangeMeal", () => {
  it("allows changing a Planned or Unconfirmed Meal", () => {
    expect(canChangeMeal({ status: "planned" })).toBe(true);
  });

  // Read-only until Reopened.
  it("refuses a Confirmed or Skipped Meal", () => {
    expect(canChangeMeal({ status: "confirmed" })).toBe(false);
    expect(canChangeMeal({ status: "skipped" })).toBe(false);
  });
});

describe("isUnconfirmed", () => {
  it("is a Planned Meal whose day has passed", () => {
    expect(isUnconfirmed({ status: "planned", date: "2026-10-27" }, "2026-10-28")).toBe(true);
  });

  it("is not a Meal today or later", () => {
    expect(isUnconfirmed({ status: "planned", date: "2026-10-28" }, "2026-10-28")).toBe(false);
    expect(isUnconfirmed({ status: "planned", date: "2026-10-29" }, "2026-10-28")).toBe(false);
  });

  it("is not a Confirmed or Skipped Meal", () => {
    expect(isUnconfirmed({ status: "confirmed", date: "2026-10-27" }, "2026-10-28")).toBe(false);
    expect(isUnconfirmed({ status: "skipped", date: "2026-10-27" }, "2026-10-28")).toBe(false);
  });
});

describe("needingConfirmation", () => {
  const yesterday = { id: "yesterday", status: "planned", date: "2026-10-27" } as const;
  const earlier = { id: "earlier", status: "planned", date: "2026-10-25" } as const;
  const confirmed = { id: "confirmed", status: "confirmed", date: "2026-10-25" } as const;
  const today = { id: "today", status: "planned", date: "2026-10-28" } as const;
  const meals = [yesterday, earlier, confirmed, today];

  it("is every Unconfirmed Meal from 03:00", () => {
    expect(needingConfirmation(meals, { date: "2026-10-28", hour: "03:00" })).toEqual([yesterday, earlier]);
    expect(needingConfirmation(meals, { date: "2026-10-28", hour: "23:59" })).toEqual([yesterday, earlier]);
  });

  // A late Meal may still be on the table after midnight.
  it("leaves out yesterday's Meals before 03:00", () => {
    expect(needingConfirmation(meals, { date: "2026-10-28", hour: "02:59" })).toEqual([earlier]);
    expect(needingConfirmation(meals, { date: "2026-10-28", hour: "00:00" })).toEqual([earlier]);
  });
});

describe("weekToClose", () => {
  // The week of Monday 2026-10-26 to Sunday 2026-11-01.
  const lastWeek = { id: "last-week", status: "planned", date: "2026-10-25" } as const;
  const monday = { id: "monday", status: "planned", date: "2026-10-26" } as const;
  const friday = { id: "friday", status: "planned", date: "2026-10-30" } as const;
  const skipped = { id: "skipped", status: "skipped", date: "2026-10-27" } as const;
  const saturday = { id: "saturday", status: "planned", date: "2026-10-31" } as const;
  const meals = [lastWeek, monday, friday, skipped, saturday];

  it("is this week's Unconfirmed Meals from Saturday", () => {
    expect(weekToClose(meals, "2026-10-31")).toEqual([monday, friday]);
    expect(weekToClose(meals, "2026-11-01")).toEqual([monday, friday, saturday]);
  });

  it("is nothing before Saturday", () => {
    expect(weekToClose(meals, "2026-10-30")).toEqual([]);
  });
});

describe("mustResolve", () => {
  const twoWeeksAgo = { id: "two-weeks-ago", status: "planned", date: "2026-10-14" } as const;
  const lastSunday = { id: "last-sunday", status: "planned", date: "2026-10-25" } as const;
  const lastConfirmed = { id: "last-confirmed", status: "confirmed", date: "2026-10-24" } as const;
  const thisMonday = { id: "this-monday", status: "planned", date: "2026-10-26" } as const;
  const meals = [twoWeeksAgo, lastSunday, lastConfirmed, thisMonday];

  // Monday 2026-10-26 starts a new week.
  it("is every Unconfirmed Meal from a week before this one, from 03:00 on Monday", () => {
    expect(mustResolve(meals, { date: "2026-10-26", hour: "03:00" })).toEqual([twoWeeksAgo, lastSunday]);
    expect(mustResolve(meals, { date: "2026-10-29", hour: "00:00" })).toEqual([twoWeeksAgo, lastSunday]);
  });

  // A late Sunday Meal is not cut off, nor is an early Monday's viewer.
  it("still counts Sunday as this week before 03:00 on Monday", () => {
    expect(mustResolve(meals, { date: "2026-10-26", hour: "02:59" })).toEqual([twoWeeksAgo]);
  });

  it("is nothing while every earlier week is closed", () => {
    expect(mustResolve([lastConfirmed, thisMonday], { date: "2026-10-29", hour: "12:00" })).toEqual([]);
  });
});
