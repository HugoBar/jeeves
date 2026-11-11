import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ShoppingListView } from "./shopping-list";

// Wednesday 11 Nov 2026, for the viewer: the Planner's week runs 9-15 Nov.
const render = (today: string | null) => renderToStaticMarkup(createElement(ShoppingListView, { items: [], today, products: [], candidates: [], shortfalls: [] }));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("the empty Shopping List", () => {
  const html = render("2026-11-11");

  it("is titled Shopping List", () => {
    expect(html).toMatch(/<h1[^>]*>Shopping List<\/h1>/);
  });

  it("says nothing is on the list and how to fill it", () => {
    expect(text(html)).toContain("Nothing on the list Generate it from Shortfalls, or add a Product by hand.");
  });

  it("offers Generate for the Planner's current week, and says what Generate keeps", () => {
    expect(text(html)).toContain("From Shortfalls Planned week · 9–15 Nov Generate");
    expect(text(html)).toContain("Keeps items added by hand and anything already on the list, with its tick.");
  });

  it("shows the week across two months", () => {
    expect(text(render("2026-10-31"))).toContain("Planned week · 26 Oct–1 Nov");
  });

  it("shows Planned week without dates until the viewer's date is known", () => {
    expect(text(render(null))).toContain("From Shortfalls Planned week Generate");
  });

  it("shows the field for adding a Product by hand, closed, above the empty state", () => {
    expect(text(html)).not.toContain("Cancel");
    expect(html).toMatch(/<input[^>]*placeholder="Add a Product by hand"[^>]*>.*Nothing on the list/);
  });
});

describe("the Shopping List with items", () => {
  const item = (
    name: string,
    quantity: number | null,
    defaultUnit: "g" | "ml" | "pc",
    packSize: { name: string; amount: number } | null = null,
  ) => ({
    id: `item-${name}`,
    quantity,
    source: "shortfall" as const,
    ticked: false,
    product: { id: `product-${name}`, name, defaultUnit, packSize },
  });
  const items = [
    item("Spinach", 100, "g", { name: "bag", amount: 500 }),
    item("Whole milk", 1400, "ml", { name: "Carton", amount: 1000 }),
    item("Salmon fillet", 150, "g"),
  ];
  const html = renderToStaticMarkup(createElement(ShoppingListView, { items, today: "2026-11-11", products: [], candidates: [], shortfalls: [] }));

  it("shows how many items it holds", () => {
    expect(text(html)).toContain("3 items");
    const one = renderToStaticMarkup(createElement(ShoppingListView, { items: [items[2]!], today: "2026-11-11", products: [], candidates: [], shortfalls: [] }));
    expect(text(one)).toContain("1 item");
  });

  it("shows the whole packs that cover an amount, with the amount needed", () => {
    expect(text(html)).toContain("Spinach 1 bag (100 g needed)");
    expect(text(html)).toContain("Whole milk 2 cartons (1,400 ml needed)");
  });

  it("shows only the amount for a Product with no Pack Size", () => {
    expect(text(html)).toContain("Salmon fillet 150 g");
  });

  it("links each item's name to its Product page, whose back link returns here", () => {
    expect(html).toMatch(/<a[^>]*href="\/products\/product-Spinach\?from=shopping-list"[^>]*>Spinach<\/a>/);
  });

  it("offers to remove each item", () => {
    expect(html).toMatch(/<button[^>]*aria-label="Remove Spinach"/);
  });

  it("no longer says the list is empty", () => {
    expect(text(html)).not.toContain("Nothing on the list");
  });
});

describe("Stock uncertain", () => {
  const unconfirmed = (date: string, productIds: string[], untracked = false) => ({
    status: "planned" as const,
    date,
    untracked,
    productIds,
  });
  const item = (name: string) => ({
    id: `item-${name}`,
    quantity: 150,
    source: "shortfall" as const,
    ticked: false,
    product: { id: `product-${name}`, name, defaultUnit: "g" as const, packSize: null },
  });
  const items = [item("Spinach"), item("Salmon fillet")];
  const render = (candidates: ReturnType<typeof unconfirmed>[], today: string | null = "2026-11-11", listed = items) =>
    renderToStaticMarkup(createElement(ShoppingListView, { items: listed, today, products: [], candidates, shortfalls: [] }));

  it("warns while Meals are Unconfirmed, with a Review link to Needs confirmation", () => {
    const html = render([unconfirmed("2026-11-09", []), unconfirmed("2026-11-10", [])]);
    expect(text(html)).toContain("Stock uncertain. 2 Meals are Unconfirmed, so some amounts may change. Review");
    expect(html).toMatch(/<a[^>]*href="\/needs-confirmation"[^>]*>Review<\/a>/);
  });

  it("says 1 Meal is for one", () => {
    expect(text(render([unconfirmed("2026-11-10", [], true)]))).toContain(
      "Stock uncertain. 1 Meal is Unconfirmed, so some amounts may change.",
    );
  });

  it("works out Unconfirmed with the viewer's today", () => {
    // Today's Meal isn't Unconfirmed yet.
    expect(text(render([unconfirmed("2026-11-11", ["product-Salmon fillet"])]))).not.toContain("Stock uncertain");
  });

  it("flags each item whose Product an Unconfirmed Meal uses", () => {
    const shown = text(render([unconfirmed("2026-11-10", ["product-Salmon fillet"])]));
    expect(shown).toContain("Salmon fillet Stock uncertain 150 g");
    expect(shown).toContain("Spinach 150 g");
  });

  it("flags nothing for an Untracked Meal", () => {
    const shown = text(render([unconfirmed("2026-11-10", ["product-Salmon fillet"], true)]));
    expect(shown).toContain("Salmon fillet 150 g");
  });

  it("shows neither the banner nor the pills with no Unconfirmed Meals", () => {
    expect(text(render([]))).not.toContain("Stock uncertain");
  });

  it("shows nothing before the viewer's date is known", () => {
    expect(text(render([unconfirmed("2026-11-10", ["product-Salmon fillet"])], null))).not.toContain("Stock uncertain");
  });

  it("shows the banner on the empty list too", () => {
    const shown = text(render([unconfirmed("2026-11-10", [])], "2026-11-11", []));
    expect(shown).toContain("Stock uncertain. 1 Meal is Unconfirmed");
    expect(shown).toContain("Nothing on the list");
  });
});
