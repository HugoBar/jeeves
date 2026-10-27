import { describe, expect, it } from "vitest";
import { foodCategoryLabel, mealTypeLabel, t } from "./index";

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
