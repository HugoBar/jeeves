import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ingredientErrorField,
  MEAL_FROM_TEMPLATE_ERROR_FIELDS,
  MEAL_SLOT_ERROR_FIELDS,
  PRODUCT_ERROR_FIELDS,
  templateSlotErrorField,
} from "./field-errors";
import { useFieldErrors } from "./form-error";

type Fields = ReturnType<typeof useFieldErrors>;

// Renders what a form would, from the errors of its last submit.
function render<E>(errors: E[], fieldOf: (error: E) => string, form: (fields: Fields) => ReactNode) {
  function Form() {
    return createElement(Fragment, null, form(useFieldErrors(errors, fieldOf, String)));
  }
  return renderToStaticMarkup(createElement(Form));
}

const nameField = (fields: Fields) =>
  createElement(Fragment, null, createElement("input", { name: "name", ...fields.invalid("name") }), fields.messages("name"));

describe("a field with an error", () => {
  it("is marked invalid and points at its message, which has the icon", () => {
    const html = render(["Enter a name."], () => "name", nameField);
    const describedBy = /aria-describedby="([^"]+)"/.exec(html)?.[1];
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain(`id="${describedBy}"`);
    expect(html).toContain("<svg");
    expect(html).toContain("Enter a name.");
  });

  it("shows nothing when the form has no errors", () => {
    expect(render([], () => "name", nameField)).toBe('<input name="name"/>');
  });

  it("leaves a field alone when the error is another field's", () => {
    const html = render(["Density must be a number."], () => "density", nameField);
    expect(html).toBe('<input name="name"/>');
  });

  it("keeps every message of a form that shows them together", () => {
    const html = render(["Enter a name.", "Enter an hour."], (error) => error, (fields) => fields.allMessages());
    expect(html).toContain("Enter a name.");
    expect(html).toContain("Enter an hour.");
  });
});

describe("which field an error belongs to", () => {
  it("puts a Product's name errors on its name and a bad Density on its Density", () => {
    expect(PRODUCT_ERROR_FIELDS.blankName).toBe("name");
    expect(PRODUCT_ERROR_FIELDS.duplicateName).toBe("name");
    expect(PRODUCT_ERROR_FIELDS.invalidDensity).toBe("density");
  });

  it("puts a Density a Recipe needs on no field, as the banner says it", () => {
    expect(PRODUCT_ERROR_FIELDS.densityInUse).toBe("form");
  });

  it("puts an incomplete Pack Size on the part left blank", () => {
    expect(PRODUCT_ERROR_FIELDS.noPackSizeName).toBe("packSizeName");
    expect(PRODUCT_ERROR_FIELDS.noPackSizeAmount).toBe("packSizeAmount");
  });

  it("puts an Ingredient's error on the field in its row that can fix it", () => {
    expect(ingredientErrorField({ row: 2, code: "noProduct" })).toBe("2-product");
    expect(ingredientErrorField({ row: 2, code: "invalidAmount" })).toBe("2-amount");
    expect(ingredientErrorField({ row: 3, code: "noDensity" })).toBe("3-unit");
  });

  it("puts a template slot's error on its row", () => {
    expect(templateSlotErrorField({ row: 4, code: "noSlotCategory" })).toBe("4");
  });

  it("puts a slot's food errors on the food or amount, and a refusal on no field", () => {
    expect(MEAL_SLOT_ERROR_FIELDS.noFood).toBe("food");
    expect(MEAL_SLOT_ERROR_FIELDS.invalidQuantity).toBe("amount");
    expect(MEAL_SLOT_ERROR_FIELDS.notChangeable).toBe("form");
  });

  it("puts a bad date on no field, as no form has one", () => {
    expect(MEAL_FROM_TEMPLATE_ERROR_FIELDS.invalidDate).toBe("form");
  });
});
