import { describe, expect, it } from "vitest";
import { parseRestockQuantity, restock } from "./index";

describe("restock", () => {
  it("adds the quantity bought to Stock", () => {
    expect(restock({ stock: 1250, stockSuspect: false }, 500)).toEqual({
      delta: 500,
      resultingQuantity: 1750,
      stockSuspect: false,
    });
  });

  it('clears the "stock was probably wrong" flag', () => {
    expect(restock({ stock: 0, stockSuspect: true }, 6).stockSuspect).toBe(false);
  });

  // Stock is stored with 2 decimals (data-model Q2); 0.1 + 0.2 is 0.30000000000000004 in JS.
  it("keeps the resulting Stock to 2 decimals", () => {
    expect(restock({ stock: 0.1, stockSuspect: false }, 0.2).resultingQuantity).toBe(0.3);
  });
});

describe("parseRestockQuantity", () => {
  it("reads the quantity bought, rounded to 2 decimals as stored", () => {
    expect(parseRestockQuantity(" 500 ")).toEqual({ ok: true, quantity: 500 });
    expect(parseRestockQuantity("1.256")).toEqual({ ok: true, quantity: 1.26 });
  });

  // 0.004 would be stored as 0, and 100000000 does not fit numeric(10,2).
  it.each([[""], ["abc"], ["0"], ["-1"], ["0.004"], ["100000000"]])(
    "rejects a quantity that is not a positive amount (%j)",
    (text) => {
      expect(parseRestockQuantity(text)).toEqual({ ok: false, error: "invalidQuantity" });
    },
  );
});
