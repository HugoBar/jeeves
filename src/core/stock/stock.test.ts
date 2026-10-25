import { describe, expect, it } from "vitest";
import { correct, deduct, parsePositiveQuantity, parseQuantityOnHand, restock } from "./index";

describe("restock", () => {
  it("adds the quantity bought to Stock", () => {
    expect(restock({ stock: 1250, stockSuspect: false }, 500)).toEqual({
      delta: 500,
      resultingQuantity: 1750,
      stockSuspect: false,
    });
  });

  // Adding to a wrong Stock leaves it wrong; only counting it fixes it.
  it('keeps the "stock was probably wrong" flag', () => {
    expect(restock({ stock: 0, stockSuspect: true }, 6).stockSuspect).toBe(true);
  });

  // Stock is stored with 2 decimals (data-model Q2); 0.1 + 0.2 is 0.30000000000000004 in JS.
  it("keeps the resulting Stock to 2 decimals", () => {
    expect(restock({ stock: 0.1, stockSuspect: false }, 0.2).resultingQuantity).toBe(0.3);
  });
});

describe("parsePositiveQuantity", () => {
  it("reads the quantity bought, rounded to 2 decimals as stored", () => {
    expect(parsePositiveQuantity(" 500 ")).toEqual({ ok: true, quantity: 500 });
    expect(parsePositiveQuantity("1.256")).toEqual({ ok: true, quantity: 1.26 });
  });

  // 0.004 would be stored as 0, and 100000000 does not fit numeric(10,2).
  it.each([[""], ["abc"], ["0"], ["-1"], ["0.004"], ["100000000"]])(
    "rejects a quantity that is not a positive amount (%j)",
    (text) => {
      expect(parsePositiveQuantity(text)).toEqual({ ok: false, error: "notAboveZero" });
    },
  );
});

describe("deduct", () => {
  it("subtracts the quantity from Stock", () => {
    expect(deduct({ stock: 1000, stockSuspect: false }, 250)).toEqual({
      delta: -250,
      resultingQuantity: 750,
      stockSuspect: false,
    });
  });

  // The delta is what was actually removed, so the history still adds up.
  it('clamps at 0 and sets the "stock was probably wrong" flag', () => {
    expect(deduct({ stock: 200, stockSuspect: false }, 300)).toEqual({
      delta: -200,
      resultingQuantity: 0,
      stockSuspect: true,
    });
  });

  it("removes nothing from empty Stock, but still flags it", () => {
    const change = deduct({ stock: 0, stockSuspect: false }, 2);
    expect(change.delta).toBe(0);
    expect(change.stockSuspect).toBe(true);
  });

  it("does not flag a deduction that leaves exactly 0", () => {
    expect(deduct({ stock: 6, stockSuspect: false }, 6)).toEqual({
      delta: -6,
      resultingQuantity: 0,
      stockSuspect: false,
    });
  });

  it("keeps the flag until a Correction clears it", () => {
    expect(deduct({ stock: 500, stockSuspect: true }, 100).stockSuspect).toBe(true);
  });
});

describe("correct", () => {
  it("sets Stock to the quantity on hand, with the difference as the delta", () => {
    expect(correct({ stock: 1000, stockSuspect: false }, 800)).toEqual({
      delta: -200,
      resultingQuantity: 800,
      stockSuspect: false,
    });
    expect(correct({ stock: 2, stockSuspect: false }, 5).delta).toBe(3);
  });

  it('clears the "stock was probably wrong" flag', () => {
    expect(correct({ stock: 0, stockSuspect: true }, 0)).toEqual({
      delta: 0,
      resultingQuantity: 0,
      stockSuspect: false,
    });
  });
});

describe("parseQuantityOnHand", () => {
  it("reads the quantity counted, which may be 0", () => {
    expect(parseQuantityOnHand(" 0 ")).toEqual({ ok: true, quantity: 0 });
    expect(parseQuantityOnHand("1.256")).toEqual({ ok: true, quantity: 1.26 });
  });

  it.each([[""], ["abc"], ["-1"], ["-0.001"], ["100000000"]])(
    "rejects a quantity that is not an amount of 0 or more (%j)",
    (text) => {
      expect(parseQuantityOnHand(text)).toEqual({ ok: false, error: "notZeroOrMore" });
    },
  );
});
