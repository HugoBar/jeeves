import { createElement, createRef, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StockActionForm, StockActionSheet, StockActions } from "./stock-action-sheet";

type FormProps = ComponentProps<typeof StockActionForm>;

const noop = () => {};

const rice: FormProps["product"] = {
  id: "1",
  name: "Basmati rice",
  defaultUnit: "g",
  density: null,
  packSize: { name: "bag", amount: 1000 },
  categoryIds: [],
  stock: 1800,
  stockSuspect: false,
};

const actions: ComponentProps<typeof StockActions>["actions"] = {
  restock: async () => null,
  discard: async () => null,
  correction: async () => null,
};

const renderForm = (props: Partial<FormProps> = {}) =>
  renderToStaticMarkup(
    createElement(StockActionForm, {
      action: "restock",
      product: rice,
      amount: "",
      error: null,
      pending: false,
      fieldRef: createRef<HTMLInputElement>(),
      onAmountChange: noop,
      onCancel: noop,
      onSubmit: noop,
      ...props,
    }),
  );

const renderSheet = (action: FormProps["action"]) =>
  renderToStaticMarkup(
    createElement(StockActionSheet, { product: rice, actions, initialAction: action, onClose: noop }),
  );

const label = (html: string) => /<label[^>]*>([^<]+)</.exec(html)?.[1];
const submit = (html: string) => /<button[^>]*type="submit"[^>]*>([^<]+)</.exec(html)?.[1];
const stockAfter = (html: string) => /<output>(.*?)<\/output>/.exec(html)?.[1]?.replace(/<[^>]+>/g, "");

describe("the Stock actions on the Product page", () => {
  it("has a button for each, with Restock the main one", () => {
    const html = renderToStaticMarkup(createElement(StockActions, { product: rice, actions }));
    expect(html.match(/<button[^>]*>[^<]+/g)?.map((button) => button.replace(/.*>/, ""))).toEqual([
      "Restock",
      "Discard",
      "Correction",
    ]);
    expect(html.match(/class="button-primary"/g)).toHaveLength(1);
    expect(html).toMatch(/class="button-primary"[^>]*>Restock</);
  });

  it("keeps the sheet closed until one is pressed", () => {
    expect(renderToStaticMarkup(createElement(StockActions, { product: rice, actions }))).not.toContain("<dialog");
  });
});

describe("the Stock action sheet", () => {
  it.each([
    ["restock", "Restock Basmati rice"],
    ["discard", "Discard Basmati rice"],
    ["correction", "Correction Basmati rice"],
  ] as const)("opens on the %s tab", (action, title) => {
    const html = renderSheet(action);
    expect(html).toContain("Stock action");
    expect(html).toContain(`>${title}</h2>`);
    expect(html.match(/aria-pressed="true"[^>]*>[^<]+/g)).toHaveLength(1);
    expect(html).toMatch(new RegExp(`aria-pressed="true"[^>]*>${title.split(" ")[0]}<`));
  });

  it("has a tab for each Stock action", () => {
    expect(renderSheet("restock").match(/<button[^>]*aria-pressed[^>]*>[^<]+/g)?.map((tab) => tab.replace(/.*>/, ""))).toEqual([
      "Restock",
      "Discard",
      "Correction",
    ]);
  });
});

describe("the Stock action form", () => {
  it.each([
    ["restock", "Amount bought", "Restock"],
    ["discard", "Amount thrown away", "Discard"],
    ["correction", "Actual amount", "Save Correction"],
  ] as const)("names the %s field and button", (action, field, button) => {
    const html = renderForm({ action });
    expect(label(html)).toBe(field);
    expect(submit(html)).toBe(button);
  });

  it("shows the Default Unit beside the amount", () => {
    expect(renderForm({ product: { ...rice, defaultUnit: "ml" } })).toContain('<span class="field-unit">ml</span>');
  });

  it("starts empty, and leaves checking to the button so a bad amount reads in the sheet", () => {
    const html = renderForm();
    expect(html).toContain('value=""');
    expect(html).not.toContain("required");
  });

  it("can be cancelled", () => {
    expect(renderForm()).toMatch(/<button type="button"[^>]*>Cancel<\/button>/);
  });

  it("shows the Pack Size on Restock", () => {
    expect(renderForm()).toContain("Pack Size is a 1,000 g bag.");
  });

  it("leaves that line out for a Product with no Pack Size", () => {
    expect(renderForm({ product: { ...rice, packSize: null } })).not.toContain("Pack Size");
  });

  it("explains Discard and Correction", () => {
    expect(renderForm({ action: "discard" })).toContain("Spoiled, spilled or thrown out.");
    expect(renderForm({ action: "correction" })).toContain("What you counted. Stock is set to this.");
  });

  describe("Stock after", () => {
    it('reads "-" until the amount is valid', () => {
      expect(stockAfter(renderForm())).toBe("1,800 g → -");
      expect(stockAfter(renderForm({ amount: "abc" }))).toBe("1,800 g → -");
    });

    it("shows the change as you type", () => {
      expect(stockAfter(renderForm({ action: "discard", amount: "150" }))).toBe("1,800 g → 1,650 g");
      expect(stockAfter(renderForm({ action: "restock", amount: "200" }))).toBe("1,800 g → 2,000 g");
      expect(stockAfter(renderForm({ action: "correction", amount: "0" }))).toBe("1,800 g → 0 g");
    });  });

  describe("discarding more than is in Stock", () => {
    const html = renderForm({ action: "discard", amount: "2000" });

    it("warns in place of the explanation", () => {
      expect(html).toContain(
        "That is more than the 1,800 g in Stock. Stock will go to 0 and Basmati rice will be flagged &quot;Stock was probably wrong&quot;.",
      );
      expect(html).not.toContain("Spoiled, spilled or thrown out.");
    });

    it("shows Stock going to 0 and the button reading Discard anyway", () => {
      expect(stockAfter(html)).toBe("1,800 g → 0 g");
      expect(submit(html)).toBe("Discard anyway");
    });

    it("doesn't warn up to what is in Stock", () => {
      const allOfIt = renderForm({ action: "discard", amount: "1800" });
      expect(allOfIt).not.toContain("That is more than");
      expect(submit(allOfIt)).toBe("Discard");
    });
  });

  describe("a rejected amount", () => {
    it("reads the Restock and Discard error in place of the explanation", () => {
      const html = renderForm({ action: "discard", amount: "abc", error: "notAboveZero" });
      expect(html).toContain("Enter an amount above 0.");
      expect(html).not.toContain("Spoiled, spilled or thrown out.");
    });

    it("reads the Correction error", () => {
      expect(renderForm({ action: "correction", error: "notZeroOrMore" })).toContain(
        "Enter what you counted. Use 0 if it&#x27;s all gone.",
      );
    });

    it("keeps the amount in the field and marks it invalid", () => {
      const html = renderForm({ amount: "abc", error: "notAboveZero" });
      expect(html).toContain('value="abc"');
      expect(html).toContain('aria-invalid="true"');
    });
  });

  it("turns its buttons off while saving", () => {
    const html = renderForm({ pending: true });
    expect(html).toMatch(/<button type="button" disabled=""[^>]*>Cancel/);
    expect(html).toMatch(/<button type="submit"[^>]*disabled=""/);
  });
});
