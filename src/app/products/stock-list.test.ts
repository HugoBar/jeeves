import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StockList } from "./stock-list";

type Props = ComponentProps<typeof StockList>;

const categories: Props["categories"] = [
  { id: "side", label: "Side Dish", kind: "role" },
  { id: "grains", label: "Grains", kind: "kind" },
];

const rice = {
  id: "1",
  name: "Basmati rice",
  stock: 1800,
  defaultUnit: "g" as const,
  stockSuspect: false,
  categoryIds: ["grains", "side"],
};

const render = (products: Props["products"]) =>
  renderToStaticMarkup(createElement(StockList, { products, categories }));

describe("a Stock list row", () => {
  it("opens the Product page, showing its name and Stock amount", () => {
    const html = render([rice]);
    expect(html).toContain('href="/products/1"');
    expect(html).toContain("Basmati rice");
    expect(html).toContain("1,800 g");
  });

  it("shows the Product's Food Categories in the order pickers list them", () => {
    expect(render([rice]).match(/<span class="pill">[^<]+/g)).toEqual([
      '<span class="pill">Side Dish',
      '<span class="pill">Grains',
    ]);
  });

  it("leaves out a Food Category that is no longer offered", () => {
    expect(render([{ ...rice, categoryIds: ["grains", "archived"] }]).match(/class="pill"/g)).toHaveLength(1);
  });

  it("shows no pills for a Product with no Food Categories", () => {
    expect(render([{ ...rice, categoryIds: [] }])).not.toContain("pills");
  });

  it("flags a Product whose Stock was probably wrong, without a pill's outline", () => {
    const html = render([{ ...rice, stockSuspect: true }]);
    expect(html).toContain('<span class="flag">Stock was probably wrong</span>');
    expect(render([rice])).not.toContain("flag");
  });

  it("shows the flag on a Product with no Food Categories", () => {
    expect(render([{ ...rice, stockSuspect: true, categoryIds: [] }])).toContain('class="flag"');
  });

  it("shows the amount in red at 0, flagged or not", () => {
    const empty = 'class="list-row-value list-row-value-empty">0 g';
    expect(render([{ ...rice, stock: 0 }])).toContain(empty);
    expect(render([{ ...rice, stock: 0, stockSuspect: true }])).toContain(empty);
  });

  it("keeps the amount plain above 0, even when flagged", () => {
    expect(render([{ ...rice, stockSuspect: true }])).not.toContain("list-row-value-empty");
  });
});

describe("the Stock list", () => {
  it("sorts Products by name", () => {
    const html = render([{ ...rice, id: "2", name: "Whole milk" }, { ...rice, id: "3", name: "apple" }, rice]);
    expect(html.match(/list-row-title">[^<]+/g)).toEqual([
      'list-row-title">apple',
      'list-row-title">Basmati rice',
      'list-row-title">Whole milk',
    ]);
  });

  it("offers Add Product and counts the Products", () => {
    const html = render([rice, { ...rice, id: "2", name: "Whole milk" }]);
    expect(html).toMatch(/href="\/products\/new"[^>]*>Add Product</);
    expect(html).toContain("2 Products");
  });

  it("counts one Product in the singular", () => {
    expect(render([rice])).toContain("1 Product<");
  });

  it("has no Stock actions or editing", () => {
    const html = render([rice]);
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<button");
  });
});

describe("the empty Stock list", () => {
  it("says how to start, with Add Product in the card too", () => {
    const html = render([]);
    expect(html).toContain("No Products yet");
    expect(html).toContain("Add a Product to start tracking what is in your Pantry.");
    expect(html.match(/href="\/products\/new"/g)).toHaveLength(2);
  });

  it("shows no count and no list", () => {
    const html = render([]);
    expect(html).not.toContain("0 Products");
    expect(html).not.toContain("<ul");
  });
});
