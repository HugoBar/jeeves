import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CategoryRow } from "./categories/category-forms";
import { FoodCategoryPill } from "./food-category-pill";
import { LinkRow } from "./list-row";
import { MealTemplateRow } from "./meal-templates/meal-template-forms";
import { MealTypeRow } from "./meal-types/meal-type-forms";

const buttonsIn = (html: string) => html.match(/<button/g)?.length ?? 0;

function expectOneTappableButton(html: string) {
  expect(html).toMatch(/^<button[^>]*class="list-row"/);
  expect(html).toMatch(/<\/button>$/);
  expect(buttonsIn(html)).toBe(1);
}

const template = {
  id: "t1",
  name: "Weeknight Dinner",
  hour: "19:30",
  mealTypeId: "m1",
  mealTypes: [{ id: "m1", label: "Dinner", archived: false }],
  slotCategories: [
    { id: "c1", label: "Fish", kind: "kind" as const, archived: false },
    { id: "c2", label: "Pulses", kind: "kind" as const, archived: true },
  ],
};

describe("a row edited in place", () => {
  it("is one button for a Food Category, showing its pill", () => {
    const html = renderToStaticMarkup(createElement(CategoryRow, { id: "1", label: "Fish", kind: "kind" }));
    expectOneTappableButton(html);
    expect(html).toContain('<span class="pill">Fish</span>');
  });

  it("tells a screen reader that opening it edits", () => {
    const html = renderToStaticMarkup(createElement(CategoryRow, { id: "1", label: "Fish", kind: "kind" }));
    expect(html).toContain('<span class="visually-hidden">Edit</span>');
  });

  it("is one button for a Meal Type, showing what the row showed before", () => {
    const html = renderToStaticMarkup(
      createElement(MealTypeRow, { id: "1", label: "Dinner", priority: 1, allowsLeftovers: true }),
    );
    expectOneTappableButton(html);
    expect(html).toContain("Priority 1");
    expect(html).toContain("allows Leftovers");
  });

  it("is one button for a Meal Template, with a pill per slot in order", () => {
    const html = renderToStaticMarkup(createElement(MealTemplateRow, { ...template, slotCategoryIds: ["c1", "c1"] }));
    expectOneTappableButton(html);
    expect(html.match(/<span class="pill">Fish<\/span>/g)).toHaveLength(2);
    expect(html).toContain("19:30");
    expect(html).not.toContain("banner");
  });

  it("marks a Meal Template's Archived slot, with the note to pick another", () => {
    const html = renderToStaticMarkup(createElement(MealTemplateRow, { ...template, slotCategoryIds: ["c1", "c2"] }));
    expect(html).toContain('<span class="pill pill-archived">Pulses</span>');
    expect(html).toContain("Category archived - pick another");
  });
});

describe("a row that opens a page", () => {
  it("is one link around all of its content", () => {
    const html = renderToStaticMarkup(LinkRow({ href: "/products/1", children: "Basmati rice" }));
    expect(html).toMatch(/^<a[^>]*class="list-row"[^>]*href="\/products\/1"|^<a[^>]*href="\/products\/1"[^>]*class="list-row"/);
    expect(html).toMatch(/Basmati rice.*<\/a>$/);
  });
});

describe("a Food Category pill", () => {
  it("is outlined the same for a Role or a Kind, as only Archived changes it", () => {
    expect(renderToStaticMarkup(createElement(FoodCategoryPill, { label: "Main Dish" }))).toBe(
      '<span class="pill">Main Dish</span>',
    );
  });
});
