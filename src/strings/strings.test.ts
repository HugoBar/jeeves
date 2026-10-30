import { describe, expect, it } from "vitest";
import {
  editingLabel,
  foodCategoryLabel,
  formatDateTime,
  formatDayHeading,
  formatList,
  formatWeekRange,
  mealTypeLabel,
  t,
} from "./index";

describe("t", () => {
  it("returns the UI string for a key", () => {
    expect(t("app.name")).toBe("Jeeves");
  });

  it("fills placeholders from params", () => {
    expect(t("planner.editingNext", { day: "Tuesday" })).toBe("Editing: next Tuesday");
  });
});

describe("foodCategoryLabel", () => {
  it("shows a seeded category by its key's string", () => {
    expect(foodCategoryLabel({ seedKey: "dried_fruit_nuts", name: null })).toBe("Dried Fruit & Nuts");
  });

  it("shows the typed name of a renamed seeded category", () => {
    expect(foodCategoryLabel({ seedKey: "white_meat", name: "Poultry" })).toBe("Poultry");
  });

  it("shows a user-created category by its name", () => {
    expect(foodCategoryLabel({ seedKey: null, name: "Sauces" })).toBe("Sauces");
  });
});

describe("mealTypeLabel", () => {
  it("shows a seeded Meal Type by its key's string", () => {
    expect(mealTypeLabel({ seedKey: "breakfast", name: null })).toBe("Breakfast");
  });

  it("shows the typed name of a renamed seeded Meal Type", () => {
    expect(mealTypeLabel({ seedKey: "snack", name: "Afternoon Bite" })).toBe("Afternoon Bite");
  });
});

describe("formatDateTime", () => {
  it("shows the afternoon on a 24-hour clock", () => {
    expect(formatDateTime(new Date(2026, 9, 28, 14, 59))).toBe("28 Oct 2026, 14:59");
  });

  it("shows just after midnight as 00, not 12", () => {
    expect(formatDateTime(new Date(2026, 9, 28, 0, 5))).toBe("28 Oct 2026, 00:05");
  });
});

describe("formatWeekRange", () => {
  it("names the month once when the week stays in it", () => {
    expect(formatWeekRange("2026-10-19", "2026-10-25")).toBe("19-25 Oct");
  });

  it("names both months when the week runs into the next", () => {
    expect(formatWeekRange("2026-10-26", "2026-11-01")).toBe("26 Oct-1 Nov");
  });
});

describe("editingLabel", () => {
  it("names a day of this week by its weekday", () => {
    expect(editingLabel("2026-10-22", "this")).toBe("Editing: Thursday");
  });

  it("says next for a day of next week", () => {
    expect(editingLabel("2026-10-27", "next")).toBe("Editing: next Tuesday");
  });

  // Off the planner, a weekday alone could be any week.
  it("names the date when no week is given", () => {
    expect(editingLabel("2026-10-12", null)).toBe("Editing: Mon 12 Oct");
  });
});

describe("formatDayHeading", () => {
  it("shows the weekday and day of the month", () => {
    expect(formatDayHeading("2026-11-01")).toBe("Sun 1");
  });
});

describe("formatList", () => {
  it.each([
    [["Pancakes (1 cup)"], "Pancakes (1 cup)"],
    [["Pancakes (1 cup)", "Bread (2 cup)"], "Pancakes (1 cup) and Bread (2 cup)"],
    [["a", "b", "c"], "a, b, and c"],
  ])("lists %j as %j", (items, expected) => {
    expect(formatList(items)).toBe(expected);
  });
});
