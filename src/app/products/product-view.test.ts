import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProductView } from "./product-view";

type Props = ComponentProps<typeof ProductView>;

const categories: Props["categories"] = [
  { id: "side", label: "Side Dish", kind: "role" },
  { id: "grains", label: "Grains", kind: "kind" },
];

const rice: Props["product"] = {
  id: "1",
  name: "Basmati rice",
  defaultUnit: "g",
  density: null,
  packSize: null,
  categoryIds: ["grains", "side"],
  stock: 1800,
  stockSuspect: false,
};

const movement = (type: Props["movements"][number]["type"], delta: number, resultingQuantity: number) => ({
  id: `${type}-${delta}`,
  createdAt: new Date("2026-10-27T12:00:00Z"),
  type,
  delta,
  resultingQuantity,
  mealId: null,
});

const actions: Props["actions"] = {
  restock: async (state) => state,
  discard: async (state) => state,
  correct: async (state) => state,
  remove: async () => {},
};

const render = (product: Partial<Props["product"]> = {}, movements: Props["movements"] = []) =>
  renderToStaticMarkup(createElement(ProductView, { product: { ...rice, ...product }, categories, movements, actions }));

describe("the Product page's heading", () => {
  it("links back to the Stock list", () => {
    expect(render()).toMatch(/<a [^>]*href="\/products"[^>]*>.*Stock<\/a>/);
  });

  it("shows the Product's name and Food Category pills in the order pickers list them", () => {
    const html = render();
    expect(html).toContain("<h1>Basmati rice</h1>");
    expect(html.match(/<span class="pill">[^<]+/g)).toEqual([
      '<span class="pill">Side Dish',
      '<span class="pill">Grains',
    ]);
  });

  it("shows no pills for a Product with no Food Categories", () => {
    expect(render({ categoryIds: [] })).not.toContain('class="pills"');
  });

  it("opens Edit Product, reading Edit on phone and Edit Product on desktop", () => {
    const edit = /<a [^>]*href="\/products\/1\/edit"[^>]*>(.*?)<\/a>/.exec(render())![1];
    expect(edit).toContain('<span class="phone-only">Edit</span>');
    expect(edit).toContain('<span class="desktop-only">Edit Product</span>');
  });
});

describe("the Stock card", () => {
  it("shows the Stock amount, with Restock, Discard and Correction", () => {
    const html = render();
    expect(html).toContain("1,800 g");
    expect(html.match(/<button[^>]*type="submit"[^>]*>[^<]+/g)?.map((button) => button.replace(/.*>/, ""))).toEqual([
      "Restock",
      "Discard",
      "Correction",
    ]);
  });

  it("makes Restock the main action", () => {
    expect(render().match(/class="button-primary"/g)).toHaveLength(1);
    expect(render()).toMatch(/class="button-primary"[^>]*>Restock</);
  });

  it("shows the last change from the newest Stock Movement", () => {
    const html = render({}, [movement("confirmation", -200, 1800), movement("restock", 1000, 2000)]);
    expect(html).toMatch(/Last change <time dateTime="2026-10-27T12:00:00.000Z"><\/time> · Confirmation</);
  });

  it("leaves out the last change for a Product with no Stock Movements", () => {
    expect(render()).not.toContain("Last change");
  });

  it("explains the flag on a flagged Product", () => {
    const html = render({ stockSuspect: true });
    expect(html).toContain('<span class="flag">Stock was probably wrong</span>');
    expect(html).toContain("A Confirmation or a Discard needed more than was in Stock. Only a Correction clears this.");
  });

  it("shows no flag on a Product that isn't flagged", () => {
    const html = render();
    expect(html).not.toContain("flag");
    expect(html).not.toContain("Only a Correction clears this.");
  });
});

describe("the Details card", () => {
  const detail = (html: string, label: string) =>
    new RegExp(`<dt>${label}<span[^>]*>([^<]+)</span></dt><dd([^>]*)>([^<]+)</dd>`).exec(html);

  it("shows each detail with its help text", () => {
    const html = render({ packSize: { name: "Bag", amount: 1000 }, density: 0.92 });
    expect(detail(html, "Default Unit")?.slice(1)).toEqual(["How Stock is counted", "", "g"]);
    expect(detail(html, "Pack Size")?.slice(1)).toEqual(["Rounds the Shopping List to whole packs", "", "Bag · 1,000 g"]);
    expect(detail(html, "Density")?.slice(1)).toEqual(["Only needed to convert cups or spoons", "", "0.92 g per ml"]);
  });

  it("reads Not set for a missing Pack Size or Density", () => {
    const html = render();
    expect(detail(html, "Pack Size")?.[3]).toBe("Not set");
    expect(detail(html, "Density")?.[3]).toBe("Not set");
  });
});

describe("Stock history", () => {
  const titles = (html: string) => html.match(/list-row-title">[^<]+/g)?.map((title) => title.replace(/.*>/, ""));

  it("is headed Stock history and says its order", () => {
    const html = render();
    expect(html).toContain("<h2>Stock history</h2>");
    expect(html).toContain("Every Stock Movement, newest first.");
  });

  it("says so when there are no Stock Movements", () => {
    const html = render();
    expect(html).toContain("No Stock Movements yet.");
    expect(html).not.toContain("<ul");
  });

  it("shows each row's type and signed amount", () => {
    const html = render({}, [
      movement("confirmation", -200, 1800),
      movement("reopen", 150, 2000),
      movement("restock", 1000, 1850),
      movement("discard", -50, 850),
    ]);
    expect(titles(html)).toEqual(["Confirmation -200 g", "Reopen +150 g", "Restock +1,000 g", "Discard -50 g"]);
  });

  it("shows a Correction as what Stock was set to", () => {
    expect(titles(render({}, [movement("correction", -300, 1000)]))).toEqual(["Correction to 1,000 g"]);
  });

  it("gives each row its type's icon and date", () => {
    const html = render({}, [movement("restock", 1000, 1800)]);
    expect(html).toContain("list-row-tile list-row-tile-restock");
    expect(html).toMatch(/list-row-meta"><time dateTime="2026-10-27T12:00:00.000Z">/);
  });

  it("has no running total on a row", () => {
    expect(render({}, [movement("restock", 1000, 1800)])).not.toContain("now");
  });
});

describe("the Remove card", () => {
  it("is headed Remove and has the Remove button", () => {
    const html = render();
    expect(html).toContain("<h2>Remove</h2>");
    expect(html).toMatch(/class="button-danger"[^>]*>Remove</);
  });
});
