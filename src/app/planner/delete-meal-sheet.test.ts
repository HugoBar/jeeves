import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DeleteMealSheet } from "./delete-meal-sheet";
import type { PlannerMeal } from "./meal-card";

const text = (markup: string) =>
  markup.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

const meal = (overrides: Partial<PlannerMeal> = {}): PlannerMeal => ({
  id: "meal-1",
  date: "2026-11-03",
  hour: "12:30",
  createdAt: new Date("2026-10-20T10:00:00Z"),
  name: "Weekday Lunch",
  mealTypeLabel: "Lunch",
  mealTypeArchived: false,
  allowsLeftovers: true,
  status: "planned",
  untracked: false,
  repeats: null,
  series: null,
  slots: [],
  addsBack: [],
  takes: { ok: true, products: [] },
  ...overrides,
});

const render = (overrides: Partial<PlannerMeal> = {}) =>
  renderToStaticMarkup(
    createElement(DeleteMealSheet, { meal: meal(overrides), label: overrides.name ?? "Weekday Lunch", onClose: () => {} }),
  );

const options = (html: string) =>
  [...html.matchAll(/<label class="series-scope">(.*?)<\/label>/g)].map((option) => ({
    text: text(option[1]!),
    checked: /<input[^>]*checked=""/.test(option[1]!),
  }));

describe("deleting a Meal of a Meal Series", () => {
  const html = render({ repeats: [1, 2, 3, 4, 5] });

  it("asks which Meals, under the series' name and days", () => {
    expect(text(/<h2[^>]*>(.*?)<\/h2>/.exec(html)![1]!)).toBe("Delete which Weekday Lunches?");
    expect(text(/<span class="sheet-eyebrow[^"]*">(.*?)<\/span>/.exec(html)![1]!)).toBe(
      "Weekday Lunch · Repeats Mon to Fri",
    );
  });

  it("offers only this one, picked first, or this and all following", () => {
    expect(options(html)).toEqual([
      { text: "Only this one Removes Tue 3 Nov. The gap stays and is never recreated.", checked: true },
      {
        text: "This and all following Deletes Tue 3 Nov and every later Planned Weekday Lunch, and ends the series. Earlier Meals keep their Repeats label.",
        checked: false,
      },
    ]);
  });

  it("says earlier, Confirmed and Skipped Meals never change, then Cancel and Delete", () => {
    expect(text(html)).toContain("Earlier, Confirmed and Skipped Meals never change.");
    expect([...html.matchAll(/<button type="button"[^>]*>([^<]*)<\/button>/g)].map((b) => b[1])).toEqual([
      "Cancel",
      "Delete",
    ]);
  });
});

describe("deleting a Meal in no series", () => {
  it("asks only whether to delete it", () => {
    const html = render();
    expect(text(/<h2[^>]*>(.*?)<\/h2>/.exec(html)![1]!)).toBe("Delete Weekday Lunch?");
    expect(options(html)).toEqual([]);
  });
});
