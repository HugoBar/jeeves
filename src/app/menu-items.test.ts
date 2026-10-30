import { describe, expect, it } from "vitest";
import { t } from "@/strings";
import { activeMenuHref, bottomMenu, moreLinks, topMenu } from "./menu-items";

const labels = (items: typeof topMenu) => items.map((item) => t(item.label));

describe("menus", () => {
  it("shows Planner, Stock, Recipes and More on desktop", () => {
    expect(labels(topMenu)).toEqual(["Planner", "Stock", "Recipes", "More"]);
  });

  it("shows Planner, Stock and More on phone", () => {
    expect(labels(bottomMenu)).toEqual(["Planner", "Stock", "More"]);
  });
});

describe("the More page", () => {
  it("links to each page with its description", () => {
    expect(moreLinks.map((link) => [link.href, t(link.label), t(link.description)])).toEqual([
      ["/recipes", "Recipes", "What you cook, with Ingredients and steps"],
      ["/categories", "Food Categories", "Roles and Kinds"],
      ["/meal-types", "Meal Types", "Meal Priority and Leftovers"],
      ["/meal-templates", "Meal Templates", "Shortcuts for creating Meals"],
    ]);
  });
});

describe("activeMenuHref", () => {
  it("marks the item for its page and the pages under it", () => {
    expect(activeMenuHref(topMenu, "/planner")).toBe("/planner");
    expect(activeMenuHref(topMenu, "/products/42/edit")).toBe("/products");
  });

  it("marks More on the More page", () => {
    expect(activeMenuHref(bottomMenu, "/more")).toBe("/more");
  });

  it("marks More on a page only the More page links to", () => {
    expect(activeMenuHref(topMenu, "/categories")).toBe("/more");
    expect(activeMenuHref(bottomMenu, "/meal-templates")).toBe("/more");
  });

  it("marks Recipes on desktop, and More on phone where Recipes has no item", () => {
    expect(activeMenuHref(topMenu, "/recipes/7")).toBe("/recipes");
    expect(activeMenuHref(bottomMenu, "/recipes/7")).toBe("/more");
  });

  it("marks nothing on Home or Needs confirmation", () => {
    expect(activeMenuHref(topMenu, "/")).toBeNull();
    expect(activeMenuHref(bottomMenu, "/needs-confirmation")).toBeNull();
  });

  it("does not mistake a page whose path only starts the same", () => {
    expect(activeMenuHref(topMenu, "/plannerish")).toBeNull();
  });
});
