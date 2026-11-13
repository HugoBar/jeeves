import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SeriesScopeSheet } from "./series-scope-sheet";

const text = (markup: string) =>
  markup.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

const options = (html: string) =>
  [...html.matchAll(/<label class="series-scope">(.*?)<\/label>/g)].map((option) => ({
    text: text(option[1]!),
    checked: /<input[^>]*checked=""/.test(option[1]!),
  }));

describe("changing a Meal of a Meal Series", () => {
  const html = renderToStaticMarkup(
    createElement(SeriesScopeSheet, {
      kind: "change",
      meal: { date: "2026-11-03", repeats: [1, 2, 3, 4, 5] },
      label: "Weekday Lunch",
      onPick: () => {},
      onClose: () => {},
    }),
  );

  it("asks which Meals, under the series' name and days", () => {
    expect(text(/<h2[^>]*>(.*?)<\/h2>/.exec(html)![1]!)).toBe("Change which Weekday Lunches?");
    expect(text(/<span class="sheet-eyebrow[^"]*">(.*?)<\/span>/.exec(html)![1]!)).toBe(
      "Weekday Lunch · Repeats Mon to Fri",
    );
  });

  it("offers only this one, picked first, or this and all following", () => {
    expect(options(html)).toEqual([
      { text: "Only this one Changes Tue 3 Nov. The rest of the series stays as it is.", checked: true },
      {
        text: "This and all following Rewrites Tue 3 Nov and every later Planned Weekday Lunch to match, even ones you edited.",
        checked: false,
      },
    ]);
  });

  it("says earlier, Confirmed and Skipped Meals never change, then Cancel and Save", () => {
    expect(text(html)).toContain("Earlier, Confirmed and Skipped Meals never change.");
    expect([...html.matchAll(/<button type="button"[^>]*>([^<]*)<\/button>/g)].map((b) => b[1])).toEqual([
      "Cancel",
      "Save",
    ]);
  });
});
