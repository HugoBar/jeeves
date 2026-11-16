import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MealRepeatsLine } from "./meal-card";

const render = (repeats: Parameters<typeof MealRepeatsLine>[0]["repeats"]) =>
  renderToStaticMarkup(createElement(MealRepeatsLine, { repeats }));

const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("a Meal Series' Repeats line", () => {
  it("puts a repeat icon, hidden from screen readers, before the days", () => {
    const html = render([1, 2, 3, 4, 5]);
    expect(html).toMatch(/^<p class="meal-card-repeats"><svg aria-hidden="true"[^>]*>.*<\/svg>Repeats Mon to Fri<\/p>$/);
  });

  it("reads only the days", () => {
    expect(text(render([1, 2, 3, 4, 5, 6, 7]))).toBe("Repeats daily");
    expect(text(render([1, 3, 5]))).toBe("Repeats Mon, Wed, Fri");
  });
});
