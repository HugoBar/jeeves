import { describe, expect, it } from "vitest";
import { moveSlot, parseTemplateSlots, parseMealTemplateFields, sortMealTemplates } from "./index";

describe("parseMealTemplateFields", () => {
  it("reads a filled-in form, trimming text", () => {
    expect(parseMealTemplateFields({ name: " Weekday Lunch ", hour: " 12:30 ", mealTypeId: " lunch-id " })).toEqual({
      ok: true,
      fields: { name: "Weekday Lunch", hour: "12:30", mealTypeId: "lunch-id" },
    });
  });

  it.each([["00:00"], ["07:05"], ["23:59"]])("takes any time of day (%j)", (hour) => {
    expect(parseMealTemplateFields({ name: "Early", hour, mealTypeId: "id" })).toMatchObject({
      ok: true,
      fields: { hour },
    });
  });
});

describe("parseMealTemplateFields rejects", () => {
  const filled = { name: "Weekday Lunch", hour: "12:30", mealTypeId: "lunch-id" };

  it.each([[""], ["   "]])("a blank name (%j)", (name) => {
    expect(parseMealTemplateFields({ ...filled, name })).toEqual({ ok: false, errors: ["blankName"] });
  });

  // The time input sends "HH:MM"; anything else is no time of day.
  it.each([[""], ["24:00"], ["12:60"], ["7:30"], ["12:30:00"], ["noon"]])(
    "an hour that is not a time of day (%j)",
    (hour) => {
      expect(parseMealTemplateFields({ ...filled, hour })).toEqual({ ok: false, errors: ["invalidHour"] });
    },
  );

  it.each([[""], ["  "]])("a missing Meal Type (%j)", (mealTypeId) => {
    expect(parseMealTemplateFields({ ...filled, mealTypeId })).toEqual({ ok: false, errors: ["noMealType"] });
  });

  it("every invalid field at once", () => {
    expect(parseMealTemplateFields({ name: "", hour: "", mealTypeId: "" })).toEqual({
      ok: false,
      errors: ["blankName", "invalidHour", "noMealType"],
    });
  });
});

describe("sortMealTemplates", () => {
  it("lists by hour, earliest first, then alphabetically by name, ignoring case", () => {
    const templates = [
      { name: "Weekend Dinner", hour: "20:00" },
      { name: "weekday Lunch", hour: "12:30" },
      { name: "Morning Snack", hour: "10:00" },
      { name: "Office Lunch", hour: "12:30" },
      { name: "Weekday Dinner", hour: "19:30" },
    ];

    expect(sortMealTemplates(templates).map((template) => template.name)).toEqual([
      "Morning Snack",
      "Office Lunch",
      "weekday Lunch",
      "Weekday Dinner",
      "Weekend Dinner",
    ]);
  });
});

describe("parseTemplateSlots", () => {
  const pickable = new Set(["main-id", "side-id", "archived-id"]);

  it("keeps each slot's Slot Category in the order given", () => {
    expect(parseTemplateSlots(["side-id", "main-id", "side-id"], pickable)).toEqual({
      ok: true,
      slotCategoryIds: ["side-id", "main-id", "side-id"],
    });
  });

  it("takes no slots at all", () => {
    expect(parseTemplateSlots([], pickable)).toEqual({ ok: true, slotCategoryIds: [] });
  });
});

describe("parseTemplateSlots rejects", () => {
  const pickable = new Set(["main-id", "side-id"]);

  // `row` counts from 1, as the form shows the slots.
  it("a slot with no Slot Category picked", () => {
    expect(parseTemplateSlots(["main-id", ""], pickable)).toEqual({
      ok: false,
      errors: [{ row: 2, code: "noSlotCategory" }],
    });
  });

  // Removed, or Archived and not already on this template: only a stale form
  // or a crafted request sends one.
  it("a Slot Category that cannot be picked", () => {
    expect(parseTemplateSlots(["gone-id", "side-id"], pickable)).toEqual({
      ok: false,
      errors: [{ row: 1, code: "unavailableSlotCategory" }],
    });
  });

  it("every invalid slot at once", () => {
    expect(parseTemplateSlots(["", "main-id", "gone-id"], pickable)).toEqual({
      ok: false,
      errors: [
        { row: 1, code: "noSlotCategory" },
        { row: 3, code: "unavailableSlotCategory" },
      ],
    });
  });
});

describe("moveSlot", () => {
  const slots = ["Starter", "Main Dish", "Dessert"];

  it("moves a slot up one place", () => {
    expect(moveSlot(slots, 1, -1)).toEqual(["Main Dish", "Starter", "Dessert"]);
  });

  it("moves a slot down one place", () => {
    expect(moveSlot(slots, 1, 1)).toEqual(["Starter", "Dessert", "Main Dish"]);
  });

  it.each([
    [0, -1],
    [2, 1],
  ] as const)("leaves the order alone when slot %i cannot move by %i", (index, offset) => {
    expect(moveSlot(slots, index, offset)).toEqual(slots);
  });
});
