import { describe, expect, it } from "vitest";
import { parseMealChanges, parseNewMeal, sortMeals } from "./index";

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
