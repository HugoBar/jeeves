import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RecipeFormFields } from "./recipe-form";

type Props = ComponentProps<typeof RecipeFormFields>;
type State = Props["state"];

const blank: State["values"] = {
  name: "",
  portions: "",
  steps: "",
  prepTimeMinutes: "",
  sourceUrl: "",
  ingredients: [],
  categoryOverrides: [],
};

const products: Props["products"] = [
  { id: "rice", name: "Basmati rice", defaultUnit: "g", archived: false },
  { id: "milk", name: "Coconut milk", defaultUnit: "ml", archived: false },
];

const renderForm = (state: Partial<State> = {}, props: Partial<Props> = {}) =>
  renderToStaticMarkup(
    createElement(RecipeFormFields, {
      state: { errors: [], ingredientErrors: [], values: blank, ...state },
      pending: false,
      products,
      categories: [],
      submitLabel: "Add Recipe",
      ...props,
    }),
  );

const renderEdit = (state: Partial<State> = {}) =>
  renderForm(state, { submitLabel: "Save", editing: true, cancelHref: "/recipes/1" });

// The page's text, without its markup.
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replaceAll("&#x27;", "'");

describe("New Recipe", () => {
  it("has the Basics, Ingredients and Steps cards", () => {
    const html = text(renderForm());
    expect(html).toContain("Basics");
    expect(html).toContain("Ingredients Amounts for the Portions above.");
    expect(html).toContain("Steps");
  });
});

const inputNamed = (html: string, name: string) => new RegExp(`<input[^>]*name="${name}"[^>]*>`).exec(html)?.[0] ?? "";
const banner = (html: string) => /<div[^>]*class="banner banner-error"[^>]*>(.*?)<\/div>/.exec(html)?.[1];
const ingredientRows = (html: string) => html.split(/class="ingredient-row[" ]/).slice(1);

const rice = { productId: "rice", amount: "0", unit: "g", minor: false };
const milk = { productId: "milk", amount: "400", unit: "pc", minor: true };

// Seven errors, as on the design: four fields and three Ingredients.
const sevenErrors: Partial<State> = {
  errors: ["blankName", "invalidPortions", "invalidPrepTime", "invalidSourceUrl"],
  ingredientErrors: [
    { row: 1, code: "invalidAmount", product: "Basmati rice" },
    { row: 2, code: "countMismatch", product: "Coconut milk", unit: "pc", defaultUnit: "ml" },
    { row: 3, code: "noProduct" },
  ],
  values: { ...blank, ingredients: [rice, milk, { productId: "", amount: "2", unit: "g", minor: false }] },
};

describe("the Basics", () => {
  it("has Portions between - and + buttons, and min beside the prep time", () => {
    const html = renderForm();
    expect(html).toMatch(/aria-label="One portion less"[^>]*>.*?<\/button><input[^>]*name="portions"[^>]*\/><button[^>]*aria-label="One portion more"/);
    expect(html).toMatch(/name="prepTimeMinutes"[^>]*\/><span class="field-unit">min<\/span>/);
  });

  it("marks Source optional", () => {
    expect(text(renderForm())).toContain("Source · optional");
  });

  it("leaves the checks to the server, so their messages show", () => {
    const html = renderForm();
    for (const name of ["name", "portions", "prepTimeMinutes"]) expect(inputNamed(html, name)).not.toContain("required");
  });
});

describe("the Ingredients", () => {
  it("gives each row its Product, amount, unit, a Minor checkbox and a remove button", () => {
    const [row] = ingredientRows(renderForm({ values: { ...blank, ingredients: [milk] } }));
    expect(row).toMatch(/<select name="ingredientProductId"[^>]*>.*<option value="milk" selected="">Coconut milk<\/option>/);
    expect(row).toContain('value="400"');
    expect(row).toMatch(/<option value="pc" selected="">pc<\/option>/);
    expect(row).toMatch(/<input type="checkbox" name="ingredientMinor" checked="" value="0"/);
    expect(row).toContain('aria-label="Remove Ingredient 1"');
  });

  it("has Add Ingredient below and says what Minor means under the card", () => {
    expect(text(renderForm())).toContain(
      "Add Ingredient Minor Ingredients, like oil or spices, don't add Food Categories.",
    );
  });
});

describe("the Steps", () => {
  it("says Markdown works under the field", () => {
    expect(text(renderForm())).toContain("Markdown works: 1. for numbered steps, **bold** for emphasis.");
  });
});

describe("Edit Recipe", () => {
  it("fills in the saved values and cancels back to the Recipe", () => {
    const html = renderEdit({ values: { ...blank, name: "Chicken curry", portions: "4", steps: "Cook it." } });
    expect(inputNamed(html, "name")).toContain('value="Chicken curry"');
    expect(inputNamed(html, "portions")).toContain('value="4"');
    expect(html).toContain("Cook it.</textarea>");
    expect(html).toContain('href="/recipes/1"');
  });
});

describe("a rejected save", () => {
  it("shows no banner before one", () => {
    expect(banner(renderForm())).toBeUndefined();
  });

  it("counts what to fix on New Recipe", () => {
    expect(text(banner(renderForm(sevenErrors))!)).toContain(
      "Fix 7 things to add this Recipe. They're marked in red below.",
    );
  });

  it("counts what to fix on Edit Recipe", () => {
    expect(text(banner(renderEdit(sevenErrors))!)).toContain(
      "Fix 7 things to save this Recipe. They're marked in red below.",
    );
  });

  it("reads Fix 1 thing with one error", () => {
    expect(text(banner(renderForm({ errors: ["blankName"] }))!)).toContain(
      "Fix 1 thing to add this Recipe. It's marked in red below.",
    );
  });

  it("shows as many errors as the banner counts", () => {
    expect(renderForm(sevenErrors).match(/class="form-error"/g)).toHaveLength(7);
  });

  it("shows each field's error under it, as today", () => {
    const html = renderForm(sevenErrors);
    expect(text(html)).toContain("Enter a name.");
    expect(text(html)).toContain("Portions must be a whole number above 0.");
    expect(inputNamed(html, "name")).toContain('aria-invalid="true"');
    expect(inputNamed(html, "portions")).toContain('aria-invalid="true"');
  });

  it("shows each Ingredient's error under its row, on the field that can fix it", () => {
    const [first = "", second = ""] = ingredientRows(renderForm(sevenErrors));
    expect(text(first)).toContain("Ingredient 1 (Basmati rice): amount must be a number above 0.");
    expect(inputNamed(first, "ingredientAmount")).toContain('aria-invalid="true"');
    expect(text(second)).toContain(
      "Ingredient 2 (Coconut milk): pc can't convert to ml, since a count can't convert to a mass or volume.",
    );
    expect(second).toMatch(/<select[^>]*name="ingredientUnit"[^>]*aria-invalid="true"/);
  });

  it("keeps everything typed and picked", () => {
    const html = renderForm({
      ...sevenErrors,
      values: {
        ...sevenErrors.values!,
        portions: "0",
        prepTimeMinutes: "40",
        sourceUrl: "example.com",
        steps: "Cook it.",
        categoryOverrides: [{ categoryId: "side", mode: "add" }],
      },
    }, { categories: [{ id: "side", label: "Side Dish", kind: "role" }] });
    expect(inputNamed(html, "portions")).toContain('value="0"');
    expect(inputNamed(html, "prepTimeMinutes")).toContain('value="40"');
    expect(inputNamed(html, "sourceUrl")).toContain('value="example.com"');
    expect(html).toContain("Cook it.</textarea>");
    expect(ingredientRows(html)).toHaveLength(3);
    expect(html).toMatch(/<option value="add" selected="">Add<\/option>/);
  });
});
