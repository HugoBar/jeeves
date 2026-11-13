import { describe, expect, it } from "vitest";
import {
  canChangeMeal,
  canReopen,
  reopensAs,
  isUnconfirmed,
  mealCardStatus,
  needingConfirmation,
  weekToClose,
  mustResolve,
  canConfirmOrSkip,
  asksForAnotherFood,
  asksWhichMeals,
  blockedByArchivedFood,
  parseMealChanges,
  parseMealSlotChanges,
  parseMealSlotCategory,
  parseNewMeal,
  parseMealSlotFill,
  parseNewMealSlot,
  parseNewMealSlots,
  newMealSlotPickable,
  pickableForSlot,
  confirmOrSkipAsksFirst,
  slotCategoryChoices,
  slotFoodValue,
  sortMeals,
  sortMealsByDay,
} from "./index";

// The Meal Types a new Meal can have in these tests.
const pickable = new Set(["lunch-id"]);

describe("parseNewMeal", () => {
  it("reads a filled-in form, trimming text", () => {
    expect(
      parseNewMeal(
        { date: "2026-10-27", hour: " 12:30 ", name: " Office Lunch ", mealTypeId: " lunch-id ", untracked: false },
        pickable,
      ),
    ).toEqual({
      ok: true,
      fields: { date: "2026-10-27", hour: "12:30", name: "Office Lunch", mealTypeId: "lunch-id", untracked: false },
    });
  });

  it("keeps a Meal set Untracked", () => {
    expect(
      parseNewMeal({ date: "2026-10-27", hour: "19:30", name: "Dinner out", mealTypeId: "lunch-id", untracked: true }, pickable),
    ).toMatchObject({ ok: true, fields: { untracked: true } });
  });

  it.each([[""], ["   "]])("takes no name as none (%j), so the card shows the Meal Type", (name) => {
    expect(parseNewMeal({ date: "2026-10-27", hour: "12:30", name, mealTypeId: "lunch-id", untracked: false }, pickable)).toMatchObject({
      ok: true,
      fields: { name: null },
    });
  });
});

describe("parseNewMeal rejects", () => {
  const filled = { date: "2026-10-27", hour: "12:30", name: "", mealTypeId: "lunch-id", untracked: false };

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
    expect(parseNewMeal({ date: "", hour: "", name: "", mealTypeId: "", untracked: false }, pickable)).toEqual({
      ok: false,
      errors: ["invalidDate", "invalidHour", "noMealType"],
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

describe("newMealSlotPickable", () => {
  const categories = [
    { id: "main-id", kind: "role" as const },
    { id: "side-id", kind: "role" as const },
    { id: "grains-id", kind: "kind" as const },
  ];

  it("offers each Recipe and Product with the Slot Categories it can give a slot, in the order listed", () => {
    const pickable = newMealSlotPickable(
      [{ id: "risotto-id", categoryIds: ["side-id", "grains-id", "main-id"] }],
      [{ id: "bread-id", categoryIds: ["grains-id"] }, { id: "water-id", categoryIds: [] }],
      categories,
    );
    expect(pickable.recipes).toEqual(new Map([["risotto-id", ["main-id", "side-id"]]]));
    expect(pickable.products).toEqual(
      new Map([
        ["bread-id", ["grains-id"]],
        ["water-id", []],
      ]),
    );
  });
});

describe("parseNewMealSlots", () => {
  const pickable = {
    recipes: new Map([["risotto-id", ["main-id", "side-id"]]]),
    products: new Map([["bread-id", ["grains-id"]]]),
  };
  const risotto = { food: "recipe:risotto-id", amount: "3", slotCategoryId: "side-id" };
  const bread = { food: "product:bread-id", amount: "120", slotCategoryId: "" };

  it("reads every slot, in the order given", () => {
    expect(parseNewMealSlots([risotto, bread], pickable)).toEqual({
      ok: true,
      slots: [
        { slotCategoryId: "side-id", fill: { content: "recipe", recipeId: "risotto-id", portions: 3 } },
        { slotCategoryId: "grains-id", fill: { content: "product", productId: "bread-id", quantity: 120 } },
      ],
    });
  });

  it("takes no slots as none", () => {
    expect(parseNewMealSlots([], pickable)).toEqual({ ok: true, slots: [] });
  });

  it("says which slots are refused and why, counting rows from 1", () => {
    const gone = { food: "recipe:gone-id", amount: "2", slotCategoryId: "" };
    const noPortions = { ...risotto, amount: "0" };
    expect(parseNewMealSlots([gone, bread, noPortions], pickable)).toEqual({
      ok: false,
      errors: [
        { row: 1, code: "unavailableFood" },
        { row: 3, code: "invalidPortions" },
      ],
    });
  });

  // Copied from a Meal Template: a Slot Category and no food.
  describe("an empty slot", () => {
    const emptyCategories = new Set(["fruit-id", "sauces-id"]);
    const fruit = { food: "", amount: "", slotCategoryId: " fruit-id " };

    it("reads it in its place among filled slots", () => {
      expect(parseNewMealSlots([fruit, bread], pickable, emptyCategories)).toEqual({
        ok: true,
        slots: [
          { slotCategoryId: "fruit-id", fill: { content: "empty" } },
          { slotCategoryId: "grains-id", fill: { content: "product", productId: "bread-id", quantity: 120 } },
        ],
      });
    });

    it.each([["gone-id"], [""]])("refuses one with a Slot Category it can't have (%j)", (slotCategoryId) => {
      expect(parseNewMealSlots([bread, { ...fruit, slotCategoryId }], pickable, emptyCategories)).toEqual({
        ok: false,
        errors: [{ row: 2, code: "unavailableSlotCategory" }],
      });
    });

    it("can have none without being told which Slot Categories it can have", () => {
      expect(parseNewMealSlots([fruit], pickable)).toEqual({
        ok: false,
        errors: [{ row: 1, code: "unavailableSlotCategory" }],
      });
    });
  });
});

describe("parseMealChanges", () => {
  it("reads a new hour and name", () => {
    expect(parseMealChanges({ hour: "13:00", name: " Late Lunch ", untracked: false })).toEqual({
      ok: true,
      changes: { hour: "13:00", name: "Late Lunch", untracked: false },
    });
  });

  it("clears the name when it is emptied", () => {
    expect(parseMealChanges({ hour: "13:00", name: " ", untracked: false })).toEqual({
      ok: true,
      changes: { hour: "13:00", name: null, untracked: false },
    });
  });

  it("sets the Meal Untracked, or tracked again", () => {
    expect(parseMealChanges({ hour: "13:00", name: "", untracked: true })).toMatchObject({ changes: { untracked: true } });
    expect(parseMealChanges({ hour: "13:00", name: "", untracked: false })).toMatchObject({ changes: { untracked: false } });
  });

  it("rejects an hour that is not a time of day", () => {
    expect(parseMealChanges({ hour: "", name: "Lunch", untracked: false })).toEqual({ ok: false, errors: ["invalidHour"] });
  });
});

describe("asksWhichMeals", () => {
  const repeat: Parameters<typeof asksWhichMeals>[0] = { repeats: [1, 2, 3, 4, 5], hour: "12:30", name: "Weekday Lunch", untracked: false };
  const asSaved = { hour: "12:30", name: "Weekday Lunch", untracked: false };

  it("asks when a repeat's hour, name or Untracked changes", () => {
    expect(asksWhichMeals(repeat, { ...asSaved, hour: "13:00" })).toBe(true);
    expect(asksWhichMeals(repeat, { ...asSaved, name: "Office Lunch" })).toBe(true);
    expect(asksWhichMeals(repeat, { ...asSaved, name: "" })).toBe(true);
    expect(asksWhichMeals(repeat, { ...asSaved, untracked: true })).toBe(true);
  });

  it("does not ask when they are as saved, once trimmed", () => {
    expect(asksWhichMeals(repeat, { hour: " 12:30 ", name: " Weekday Lunch ", untracked: false })).toBe(false);
    expect(asksWhichMeals({ ...repeat, name: null }, { ...asSaved, name: " " })).toBe(false);
  });

  it("does not ask for a Meal in no series, or an hour Save will refuse", () => {
    expect(asksWhichMeals({ ...repeat, repeats: null }, { ...asSaved, hour: "13:00" })).toBe(false);
    expect(asksWhichMeals(repeat, { ...asSaved, hour: "lunchtime" })).toBe(false);
  });
});

describe("parseMealSlotChanges", () => {
  // The Meal's slots as stored, in order, and the non-Archived Food
  // Categories, in these tests.
  const current = [
    { id: "main", slotCategoryId: "main-dish" },
    { id: "veg", slotCategoryId: "vegetables" },
    { id: "fruit", slotCategoryId: "fruit" },
  ];
  const pickable = new Set(["main-dish", "vegetables", "fruit", "fish"]);
  const changed = (...slots: [string, string][]) => slots.map(([slotId, slotCategoryId]) => ({ slotId, slotCategoryId }));

  it("keeps the slots in the order sent, removing the ones removed", () => {
    expect(
      parseMealSlotChanges({ order: ["fruit", "main"], removed: ["veg"], slotCategories: [] }, current, pickable),
    ).toEqual({ ok: true, changes: { removed: ["veg"], order: ["fruit", "main"], slotCategories: [] } });
  });

  it("keeps the order as stored when nothing was sent", () => {
    expect(parseMealSlotChanges({ order: [], removed: [], slotCategories: [] }, current, pickable)).toEqual({
      ok: true,
      changes: { removed: [], order: ["main", "veg", "fruit"], slotCategories: [] },
    });
  });

  it("changes the Slot Categories sent", () => {
    const sent = { order: [], removed: [], slotCategories: changed(["main", "fish"]) };
    expect(parseMealSlotChanges(sent, current, pickable)).toEqual({
      ok: true,
      changes: { removed: [], order: ["main", "veg", "fruit"], slotCategories: [{ slotId: "main", slotCategoryId: "fish" }] },
    });
  });

  // Changed to Fish on the form, then changed elsewhere to Fish meanwhile,
  // or set back on the form to what it was.
  it("writes nothing for a Slot Category sent that is already stored", () => {
    const sent = { order: [], removed: [], slotCategories: changed(["veg", "vegetables"]) };
    expect(parseMealSlotChanges(sent, current, pickable)).toMatchObject({ ok: true, changes: { slotCategories: [] } });
  });

  // Archived since Edit Meal opened, or a crafted id.
  it("refuses a Slot Category changed to one that is Archived or gone, or none", () => {
    const sent = { order: [], removed: [], slotCategories: changed(["main", "archived"], ["veg", " "]) };
    expect(parseMealSlotChanges(sent, current, pickable)).toEqual({
      ok: false,
      errors: [
        { slotId: "main", code: "unavailableSlotCategory" },
        { slotId: "veg", code: "noSlotCategory" },
      ],
    });
  });

  it("ignores a Slot Category sent for a slot removed on the form", () => {
    const sent = { order: [], removed: ["main"], slotCategories: changed(["main", "archived"]) };
    expect(parseMealSlotChanges(sent, current, pickable)).toEqual({
      ok: true,
      changes: { removed: ["main"], order: ["veg", "fruit"], slotCategories: [] },
    });
  });

  it("leaves out a slot removed meanwhile, and puts one added meanwhile last", () => {
    const now = [...current.filter((slot) => slot.id !== "veg"), { id: "added", slotCategoryId: "fish" }];
    const sent = { order: ["fruit", "veg", "main"], removed: ["gone"], slotCategories: changed(["veg", "fish"]) };
    expect(parseMealSlotChanges(sent, now, pickable)).toEqual({
      ok: true,
      changes: { removed: [], order: ["fruit", "main", "added"], slotCategories: [] },
    });
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

describe("asksForAnotherFood", () => {
  it("asks for another Archived Recipe or Product in a Meal today or later", () => {
    expect(asksForAnotherFood({ status: "planned", date: "2026-10-28" }, true, "2026-10-28")).toBe(true);
    expect(asksForAnotherFood({ status: "planned", date: "2026-11-02" }, true, "2026-10-28")).toBe(true);
  });

  it("keeps it in a Meal whose day has passed", () => {
    expect(asksForAnotherFood({ status: "planned", date: "2026-10-27" }, true, "2026-10-28")).toBe(false);
  });

  // Their slots can no longer change.
  it("keeps it in a Confirmed or Skipped Meal", () => {
    expect(asksForAnotherFood({ status: "confirmed", date: "2026-10-28" }, true, "2026-10-28")).toBe(false);
    expect(asksForAnotherFood({ status: "skipped", date: "2026-10-28" }, true, "2026-10-28")).toBe(false);
  });

  it("asks nothing of food that is not Archived", () => {
    expect(asksForAnotherFood({ status: "planned", date: "2026-10-28" }, false, "2026-10-28")).toBe(false);
  });
});

describe("blockedByArchivedFood", () => {
  const meal = { status: "planned" as const, date: "2026-10-28" };

  it("blocks Confirming while one slot asks for another food", () => {
    expect(blockedByArchivedFood(meal, [false, true], "2026-10-28")).toBe(true);
  });

  it("allows it once every slot holds food that is not Archived", () => {
    expect(blockedByArchivedFood(meal, [false, false], "2026-10-28")).toBe(false);
    expect(blockedByArchivedFood(meal, [], "2026-10-28")).toBe(false);
  });

  it("allows it on a Meal whose day has passed", () => {
    expect(blockedByArchivedFood({ ...meal, date: "2026-10-27" }, [true], "2026-10-28")).toBe(false);
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

describe("reopensAs", () => {
  it("returns a Meal dated today or later to Planned", () => {
    expect(reopensAs({ date: "2026-10-28" }, "2026-10-28")).toBe("planned");
    expect(reopensAs({ date: "2026-10-30" }, "2026-10-28")).toBe("planned");
  });

  it("returns a Meal whose day has passed to Unconfirmed", () => {
    expect(reopensAs({ date: "2026-10-27" }, "2026-10-28")).toBe("unconfirmed");
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

describe("mealCardStatus", () => {
  const today = "2026-10-28";
  const status = (meal: { status: "planned" | "confirmed" | "skipped"; untracked: boolean; date?: string }) =>
    mealCardStatus({ date: today, ...meal }, today);

  it("shows nothing for a Planned Meal", () => {
    expect(status({ status: "planned", untracked: false })).toBeNull();
  });

  it("shows Untracked for a Planned Meal marked Untracked", () => {
    expect(status({ status: "planned", untracked: true })).toBe("untracked");
  });

  it("shows Confirmed, or Confirmed · Untracked when it took nothing from Stock", () => {
    expect(status({ status: "confirmed", untracked: false })).toBe("confirmed");
    expect(status({ status: "confirmed", untracked: true })).toBe("confirmedUntracked");
  });

  it("shows Skipped, Untracked or not", () => {
    expect(status({ status: "skipped", untracked: false })).toBe("skipped");
    expect(status({ status: "skipped", untracked: true })).toBe("skipped");
  });

  it("shows Unconfirmed once a Planned Meal's day has passed, or Unconfirmed · Untracked", () => {
    expect(status({ status: "planned", untracked: false, date: "2026-10-27" })).toBe("unconfirmed");
    expect(status({ status: "planned", untracked: true, date: "2026-10-27" })).toBe("unconfirmedUntracked");
  });
});
