import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RecipeView } from "./recipe-view";

type Props = ComponentProps<typeof RecipeView>;

const curry: Props["recipe"] = {
  id: "1",
  name: "Chicken curry",
  portions: 4,
  prepTimeMinutes: 40,
  sourceUrl: "https://example.com/curry",
  steps: "1. Brown the chicken.\n2. Add the rice.",
};

const render = (props: Partial<Props> = {}) =>
  renderToStaticMarkup(
    createElement(RecipeView, {
      recipe: curry,
      ingredients: [],
      foodCategories: [],
      remove: async () => {},
      ...props,
    }),
  );

describe("the Recipe page's heading", () => {
  it("links back to the Recipes list", () => {
    expect(render()).toMatch(/<a [^>]*href="\/recipes"[^>]*>.*Recipes<\/a>/);
  });

  it("shows the Recipe's name", () => {
    expect(render()).toContain("<h1>Chicken curry</h1>");
  });

  it("opens Edit Recipe, reading Edit on phone and Edit Recipe on desktop", () => {
    const edit = /<a [^>]*href="\/recipes\/1\/edit"[^>]*>(.*?)<\/a>/.exec(render())![1];
    expect(edit).toContain('<span class="phone-only">Edit</span>');
    expect(edit).toContain('<span class="desktop-only">Edit Recipe</span>');
  });
});

describe("the line under the title", () => {
  const facts = (html: string) => /<p class="recipe-facts">(.*?)<\/p>/.exec(html)![1]!;

  it("shows Portions and prep time", () => {
    const html = facts(render());
    expect(html).toContain("<span>4 portions</span>");
    expect(html).toContain("<span>40 min</span>");
  });

  it("says 1 portion for a Recipe written for one", () => {
    expect(facts(render({ recipe: { ...curry, portions: 1 } }))).toContain("<span>1 portion</span>");
  });

  it("links to the Source URL in a new tab", () => {
    expect(facts(render())).toMatch(
      /<a href="https:\/\/example.com\/curry" target="_blank" rel="noopener noreferrer">Source<span aria-hidden="true"> ↗<\/span><\/a>/,
    );
  });

  it("shows no Source link for a Recipe with no Source URL", () => {
    expect(facts(render({ recipe: { ...curry, sourceUrl: null } }))).not.toContain("<a");
  });
});

describe("Food Categories", () => {
  const category = (id: string, kind: "role" | "kind", name: string) => ({ id, kind, name, seedKey: null });
  const card = (html: string) => /<div class="card recipe-categories">(.*?)<\/div>/.exec(html)![1]!;

  it("is headed Food Categories and says where they come from", () => {
    const html = card(render());
    expect(html).toContain("<h2>Food Categories</h2>");
    expect(html).toContain("They come from its Ingredients, plus any Food Category Overrides.");
  });

  it("shows the outlined pills, Roles first, then Kinds", () => {
    const html = card(
      render({
        foodCategories: [
          category("v", "kind", "Vegetables"),
          category("p", "kind", "Poultry"),
          category("m", "role", "Main Dish"),
        ],
      }),
    );
    expect(html.match(/<span class="pill">[^<]+/g)).toEqual([
      '<span class="pill">Main Dish',
      '<span class="pill">Poultry',
      '<span class="pill">Vegetables',
    ]);
  });

  it("names a seeded Food Category by its seed", () => {
    const html = card(render({ foodCategories: [{ id: "w", kind: "kind", name: null, seedKey: "white_meat" }] }));
    expect(html).toContain('<span class="pill">White Meat</span>');
  });

  it("says so when the Recipe has none", () => {
    const html = card(render());
    expect(html).toContain("None yet.");
    expect(html).not.toContain("pill");
  });
});

describe("Ingredients", () => {
  const ingredient = (productName: string, amount: number, unit: "g" | "tbsp", minor = false) => ({
    productId: productName,
    productName,
    amount,
    unit,
    minor,
  });
  const rows = (html: string) =>
    [...html.matchAll(/<li class="recipe-ingredient">(.*?)<\/li>/g)].map((row) => row[1]!.replace(/<[^>]+>/g, "|"));

  it("lists each Product and its amount", () => {
    const html = render({ ingredients: [ingredient("Chicken thighs", 600, "g"), ingredient("Basmati rice", 1800, "g")] });
    expect(html).toMatch(/<h2[^>]*>Ingredients<\/h2>/);
    expect(rows(html)).toEqual(["|Chicken thighs||600 g|", "|Basmati rice||1,800 g|"]);
  });

  it("marks a Minor Ingredient", () => {
    const html = render({ ingredients: [ingredient("Curry paste", 2, "tbsp", true)] });
    expect(html).toContain('Curry paste <span class="tag">Minor</span>');
  });

  it("marks only Minor Ingredients", () => {
    expect(render({ ingredients: [ingredient("Chicken thighs", 600, "g")] })).not.toContain('class="tag"');
  });

  it("says Minor Ingredients don't add Food Categories", () => {
    expect(render({ ingredients: [ingredient("Chicken thighs", 600, "g")] })).toContain(
      "Minor Ingredients don&#x27;t add Food Categories.",
    );
  });

  it("says so when the Recipe has none", () => {
    const html = render();
    expect(html).toContain("No Ingredients yet.");
    expect(html).not.toContain("recipe-ingredient\"");
  });
});

describe("Steps", () => {
  it("renders the steps from Markdown", () => {
    const html = render();
    expect(html).toMatch(/<h2[^>]*>Steps<\/h2>/);
    expect(html).toContain("<ol>\n<li>Brown the chicken.</li>\n<li>Add the rice.</li>\n</ol>");
  });

  it("escapes raw HTML in the steps", () => {
    const html = render({ recipe: { ...curry, steps: "<script>alert(1)</script>" } });
    expect(html).not.toContain("<script>");
  });

  it("says so when the Recipe has none", () => {
    expect(render({ recipe: { ...curry, steps: "  " } })).toContain("No steps yet.");
  });
});

describe("Remove", () => {
  it("has a Remove card with the Remove button", () => {
    const html = render();
    expect(html).toMatch(/<div class="card recipe-remove"><h2>Remove<\/h2>/);
    expect(html).toMatch(/<button type="button" class="button-danger">Remove<\/button>/);
  });

  it("says a Recipe in use is Archived instead", () => {
    expect(render()).toContain("If it is in use, such as being planned in a Meal Slot, it is Archived instead.");
  });
});
