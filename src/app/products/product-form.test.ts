import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProductFormFields } from "./product-form";

type Props = ComponentProps<typeof ProductFormFields>;

const blank = { name: "", density: "", packSizeName: "", packSizeAmount: "", categoryIds: [] };

const categories: Props["categories"] = [
  { id: "side", label: "Side Dish", kind: "role" },
  { id: "grains", label: "Grains", kind: "kind" },
];

const renderForm = (props: Partial<Props> = {}) =>
  renderToStaticMarkup(
    createElement(ProductFormFields, {
      state: { errors: [], values: blank },
      pending: false,
      categories,
      submitLabel: "Add Product",
      ...props,
    }),
  );

const renderEdit = (state: Partial<Props["state"]> = {}) =>
  renderForm({
    state: { errors: [], values: blank, ...state },
    submitLabel: "Save",
    editing: { name: "Basmati rice", defaultUnit: "g" },
    cancelHref: "/products/1",
  });

// The page's text, without its markup.
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replaceAll("&#x27;", "'");
const inputNamed = (html: string, name: string) => new RegExp(`<input[^>]*name="${name}"[^>]*>`).exec(html)?.[0] ?? "";
const inputValued = (html: string, value: string) =>
  new RegExp(`<input[^>]*value="${value}"[^>]*>`).exec(html)?.[0] ?? "";
const banner = (html: string) => /<div[^>]*class="banner banner-error"[^>]*>(.*?)<\/div>/.exec(html)?.[1];

describe("New Product", () => {
  it("picks the Default Unit with g, ml and pc, g first", () => {
    const html = renderForm();
    expect(text(html)).toContain("g grams ml millilitres pc pieces");
    expect(inputValued(html, "g")).toContain("checked");
    expect(inputValued(html, "ml")).not.toContain("checked");
  });

  it("says Stock starts at 0", () => {
    expect(text(renderForm())).toContain("Stock starts at 0. Restock it after adding.");
  });

  it("leaves the check for a missing name to the server, so its message shows", () => {
    expect(inputNamed(renderForm(), "name")).not.toContain("required");
  });

  it("keeps the Default Unit picked before a rejected save, also beside the pack amount", () => {
    const html = renderForm({ state: { errors: ["blankName"], values: { ...blank, defaultUnit: "ml" } } });
    expect(inputValued(html, "ml")).toContain("checked");
    expect(html).toContain('<span class="field-unit">ml</span>');
  });
});

describe("Edit Product", () => {
  it("shows the Default Unit locked, with no way to change it", () => {
    const html = renderEdit();
    expect(text(html)).toContain("A Product's Default Unit can't be changed.");
    expect(html).not.toContain('name="defaultUnit"');
    expect(text(html)).not.toContain("Stock starts at 0");
  });

  it("cancels back to the Product", () => {
    expect(renderEdit()).toContain('href="/products/1"');
  });
});

describe("Food Categories", () => {
  it("lists Kinds, then Roles", () => {
    expect(text(renderForm())).toContain("Kinds Grains Roles Side Dish");
  });

  it("are chips, ticked by the box inside them when picked", () => {
    const html = renderForm({ state: { errors: [], values: { ...blank, categoryIds: ["side"] } } });
    expect(inputValued(html, "side")).toContain("checked");
    expect(inputValued(html, "grains")).not.toContain("checked");
    expect(html).toContain('<label class="chip">');
  });
});

describe("the optional fields", () => {
  it("shows the Default Unit beside the pack amount", () => {
    expect(renderEdit()).toContain('<span class="field-unit">g</span>');
  });

  it("shows g per ml beside the Density", () => {
    expect(renderForm()).toContain('<span class="field-unit">g per ml</span>');
  });
});

describe("a rejected save", () => {
  it("shows no banner before one", () => {
    expect(banner(renderForm())).toBeUndefined();
  });

  it("counts what to fix on New Product", () => {
    const html = renderForm({
      state: { errors: ["blankName", "invalidDensity", "noPackSizeAmount"], values: blank },
    });
    expect(text(banner(html)!)).toContain("Fix 3 things to add this Product. They're marked in red below.");
  });

  it("counts what to fix on Edit Product", () => {
    const html = renderEdit({ errors: ["blankName", "invalidDensity", "noPackSizeAmount"] });
    expect(text(banner(html)!)).toContain("Fix 3 things to save this Product. They're marked in red below.");
  });

  it("reads Fix 1 thing with one error", () => {
    const html = renderForm({ state: { errors: ["blankName"], values: blank } });
    expect(text(banner(html)!)).toContain("Fix 1 thing to add this Product. It's marked in red below.");
  });

  it("shows a missing name under the name", () => {
    const html = renderForm({ state: { errors: ["blankName"], values: blank } });
    expect(text(html)).toContain("Enter a name.");
    expect(inputNamed(html, "name")).toContain('aria-invalid="true"');
  });

  it("names the Product that has the name already", () => {
    const html = renderForm({ state: { errors: ["duplicateName"], values: { ...blank, name: " Basmati rice " } } });
    expect(text(html)).toContain("There's already a Product called Basmati rice.");
  });

  it("asks for the pack amount when only the name is filled in", () => {
    const html = renderForm({ state: { errors: ["noPackSizeAmount"], values: { ...blank, packSizeName: "Bag" } } });
    expect(text(html)).toContain("Add the pack amount, or clear the pack name.");
    expect(inputNamed(html, "packSizeAmount")).toContain('aria-invalid="true"');
    expect(inputNamed(html, "packSizeName")).not.toContain("aria-invalid");
  });

  it("asks for the pack name when only the amount is filled in", () => {
    const html = renderForm({ state: { errors: ["noPackSizeName"], values: { ...blank, packSizeAmount: "500" } } });
    expect(text(html)).toContain("Add the pack name, or clear the pack amount.");
    expect(inputNamed(html, "packSizeName")).toContain('aria-invalid="true"');
  });

  it("puts an error where the field's hint was", () => {
    const html = renderForm({ state: { errors: ["invalidDensity"], values: blank } });
    expect(text(html)).toContain("Density must be a number above 0.");
    expect(text(html)).not.toContain("Only needed to use cups or spoons in Recipes.");
  });

  it("counts a taken name with the field errors of the same save", () => {
    const html = renderForm({
      state: { errors: ["duplicateName", "invalidDensity", "noPackSizeAmount"], values: { ...blank, name: "Rice" } },
    });
    expect(text(banner(html)!)).toContain("Fix 3 things to add this Product.");
    expect(html.match(/class="form-error"/g)).toHaveLength(3);
  });

  it("says in the banner which Recipes need a Density, naming the Product as saved, instead of counting", () => {
    const html = renderEdit({
      errors: ["densityInUse"],
      values: { ...blank, name: "Renamed rice" },
      densityUses: [{ recipeName: "Rice pudding", amount: 1, unit: "cup" }],
    });
    expect(text(banner(html)!)).toContain(
      "Basmati rice's Density is used by Rice pudding (1 cup). Change those Ingredients to g first, or keep the Density.",
    );
    expect(text(html)).not.toContain("Fix 1 thing");
    expect(inputNamed(html, "density")).not.toContain("aria-invalid");
  });

  it("keeps everything typed and picked", () => {
    const html = renderForm({
      state: {
        errors: ["blankName"],
        values: { name: "", density: "0.85", packSizeName: "Bag", packSizeAmount: "500", categoryIds: ["grains"] },
      },
    });
    expect(inputNamed(html, "density")).toContain('value="0.85"');
    expect(inputNamed(html, "packSizeName")).toContain('value="Bag"');
    expect(inputNamed(html, "packSizeAmount")).toContain('value="500"');
    expect(inputValued(html, "grains")).toContain("checked");
  });
});
