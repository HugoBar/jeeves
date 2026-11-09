import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ShoppingListView } from "./shopping-list";

// Wednesday 11 Nov 2026, for the viewer: the Planner's week runs 9-15 Nov.
const render = (today: string | null) => renderToStaticMarkup(createElement(ShoppingListView, { items: [], today }));
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

  it("shows the field and + button for adding a Product by hand", () => {
    expect(html).toMatch(/<input[^>]*placeholder="Add a Product by hand"/);
    expect(html).toMatch(/<button[^>]*aria-label="Add a Product by hand"/);
  });
});
