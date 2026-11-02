import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RecipeList } from "./recipe-list";

type Props = ComponentProps<typeof RecipeList>;

const categories: Props["categories"] = [
  { id: "main", label: "Main Dish", kind: "role" },
  { id: "grains", label: "Grains", kind: "kind" },
  { id: "poultry", label: "Poultry", kind: "kind" },
];

const curry = {
  id: "1",
  name: "Chicken curry",
  portions: 4,
  prepTimeMinutes: 40,
  categoryIds: ["poultry", "main", "grains"],
};

const render = (recipes: Props["recipes"]) =>
  renderToStaticMarkup(createElement(RecipeList, { recipes, categories }));

describe("a Recipes list row", () => {
  it("opens the Recipe page, showing its name, Portions and prep time", () => {
    const html = render([curry]);
    expect(html).toContain('href="/recipes/1"');
    expect(html).toContain("Chicken curry");
    expect(html).toContain("4 portions · 40 min");
  });

  it("says one portion in the singular", () => {
    expect(render([{ ...curry, portions: 1 }])).toContain("1 portion · 40 min");
  });

  it("shows the Recipe's Food Categories in the order pickers list them", () => {
    expect(render([curry]).match(/<span class="pill">[^<]+/g)).toEqual([
      '<span class="pill">Main Dish',
      '<span class="pill">Grains',
      '<span class="pill">Poultry',
    ]);
  });

  it("leaves out a Food Category that is no longer offered", () => {
    expect(render([{ ...curry, categoryIds: ["grains", "archived"] }]).match(/class="pill"/g)).toHaveLength(1);
  });

  it("shows no pills for a Recipe with no Food Categories", () => {
    expect(render([{ ...curry, categoryIds: [] }])).not.toContain("pills");
  });
});

describe("the Recipes list", () => {
  it("sorts Recipes by name", () => {
    const html = render([{ ...curry, id: "2", name: "Roasted potatoes" }, { ...curry, id: "3", name: "apple crumble" }, curry]);
    expect(html.match(/list-row-title">[^<]+/g)).toEqual([
      'list-row-title">apple crumble',
      'list-row-title">Chicken curry',
      'list-row-title">Roasted potatoes',
    ]);
  });

  it("offers Add Recipe and counts the Recipes", () => {
    const html = render([curry, { ...curry, id: "2", name: "Fried rice" }]);
    expect(html).toMatch(/<h1>Recipes<span class="page-count">2 Recipes<\/span><\/h1>/);
    expect(html).toMatch(/href="\/recipes\/new"[^>]*>Add Recipe</);
  });

  it("counts one Recipe in the singular", () => {
    expect(render([curry])).toContain("1 Recipe<");
  });

  it("has Recipe, Food Categories, Portions and Prep time columns for desktop", () => {
    const html = render([curry]);
    expect(html).toMatch(
      /<li class="recipe-list-head" aria-hidden="true"><span>Recipe<\/span><span>Food Categories<\/span><span>Portions<\/span><span>Prep time<\/span><\/li>/,
    );
    expect(html).toContain('<span class="recipe-list-portions">4</span><span class="recipe-list-prep-time">40 min</span>');
  });

  it("links back to More on phone, where Recipes isn't in the menu", () => {
    expect(render([curry])).toMatch(/<span class="phone-only"><a class="back-link" href="\/more">.*More<\/a>/);
  });
});

describe("the empty Recipes list", () => {
  it("says how to start, with Add Recipe in the card too", () => {
    const html = render([]);
    expect(html).toContain("No Recipes yet");
    expect(html).toContain("Add a Recipe to plan Meals from it.");
    expect(html.match(/href="\/recipes\/new"/g)).toHaveLength(2);
  });

  it("shows no count and no list", () => {
    const html = render([]);
    expect(html).not.toContain("page-count");
    expect(html).not.toContain("<ul");
  });
});
