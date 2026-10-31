import { describe, expect, it } from "vitest";
import {
  correct,
  deduct,
  parseHistoryRows,
  parsePositiveQuantity,
  parseQuantityOnHand,
  parseStockAmount,
  previewStockAction,
  restock,
  reverse,
} from "./index";

describe("parseHistoryRows", () => {
  it("starts at the newest 10 rows", () => {
    expect(parseHistoryRows(undefined)).toBe(10);
  });

  it("reads how many rows the page asked for", () => {
    expect(parseHistoryRows("30")).toBe(30);
  });

  it.each([["0"], ["-10"], ["2.5"], ["ten"], [""], ["99999999999999999999"], [["10", "20"]]])(
    "falls back to 10 rows for %j",
    (rows) => {
      expect(parseHistoryRows(rows)).toBe(10);
    },
  );
});

describe("restock", () => {
  it("adds the quantity bought to Stock", () => {
    expect(restock({ stock: 1250, stockSuspect: false }, 500)).toEqual({
      delta: 500,
      resultingQuantity: 1750,
      stockSuspect: false,
      clamped: false,
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
      clamped: false,
    });
  });

  // The delta is what was actually removed, so the history still adds up.
  it('clamps at 0 and sets the "stock was probably wrong" flag', () => {
    expect(deduct({ stock: 200, stockSuspect: false }, 300)).toEqual({
      delta: -200,
      resultingQuantity: 0,
      stockSuspect: true,
      clamped: true,
    });
  });

  it("removes nothing from empty Stock, but still flags it", () => {
    const change = deduct({ stock: 0, stockSuspect: false }, 2);
    expect(change.delta).toBe(0);
    expect(change.stockSuspect).toBe(true);
    expect(change.clamped).toBe(true);
  });

  it("does not flag a deduction that leaves exactly 0", () => {
    expect(deduct({ stock: 6, stockSuspect: false }, 6)).toEqual({
      delta: -6,
      resultingQuantity: 0,
      stockSuspect: false,
      clamped: false,
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
      clamped: false,
    });
    expect(correct({ stock: 2, stockSuspect: false }, 5).delta).toBe(3);
  });

  it('clears the "stock was probably wrong" flag', () => {
    expect(correct({ stock: 0, stockSuspect: true }, 0)).toEqual({
      delta: 0,
      resultingQuantity: 0,
      stockSuspect: false,
      clamped: false,
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

describe("parseStockAmount", () => {
  it("rejects by each Stock action's own rule", () => {
    expect(parseStockAmount("discard", "0")).toEqual({ ok: false, error: "notAboveZero" });
    expect(parseStockAmount("correction", "0")).toEqual({ ok: true, quantity: 0 });
  });
});

describe("parseStockAmount for a Discard", () => {
  it("has no upper limit, as Stock stops at 0 however much is discarded", () => {
    expect(parseStockAmount("discard", "123123123")).toEqual({ ok: true, quantity: 123123123 });
  });

  it("keeps the limit on amounts that end up stored", () => {
    expect(parseStockAmount("restock", "123123123")).toEqual({ ok: false, error: "notAboveZero" });
    expect(parseStockAmount("correction", "123123123")).toEqual({ ok: false, error: "notZeroOrMore" });
  });

  it.each([[""], ["abc"], ["0"], ["-1"], ["0.001"], ["Infinity"], ["1e400"], ["1e308"]])(
    "rejects what isn't an amount above 0 (%j)",
    (text) => {
      expect(parseStockAmount("discard", text)).toEqual({ ok: false, error: "notAboveZero" });
    },
  );
});

describe("previewStockAction", () => {
  const current = { stock: 1800, stockSuspect: false };

  it("still warns of a Discard too big to store", () => {
    expect(previewStockAction("discard", { stock: 400, stockSuspect: false }, "123123123")).toMatchObject({
      resultingQuantity: 0,
      stockSuspect: true,
      clamped: true,
    });
  });

  it("shows what a Restock will leave", () => {
    expect(previewStockAction("restock", current, "200")?.resultingQuantity).toBe(2000);
  });

  it("shows what a Discard will leave", () => {
    expect(previewStockAction("discard", current, "150")?.resultingQuantity).toBe(1650);
  });

  it("shows a Correction as the amount counted", () => {
    expect(previewStockAction("correction", current, "1650")?.resultingQuantity).toBe(1650);
    expect(previewStockAction("correction", current, "0")?.resultingQuantity).toBe(0);
  });

  it("clamps a Discard of more than is in Stock at 0 and flags it", () => {
    expect(previewStockAction("discard", current, "2000")).toMatchObject({
      resultingQuantity: 0,
      stockSuspect: true,
      clamped: true,
    });
  });

  it("doesn't clamp a Discard of exactly what is in Stock", () => {
    expect(previewStockAction("discard", current, "1800")).toMatchObject({ resultingQuantity: 0, clamped: false });
  });

  it.each([
    ["restock", ""],
    ["restock", "0"],
    ["discard", "abc"],
    ["correction", ""],
    ["correction", "-1"],
  ] as const)("has nothing to show for a %s of %j", (action, text) => {
    expect(previewStockAction(action, current, text)).toBeNull();
  });
});

describe("reverse", () => {
  it("adds back what the movement removed", () => {
    expect(reverse({ stock: 50, stockSuspect: false }, -200, false)).toEqual({
      delta: 200,
      resultingQuantity: 250,
      stockSuspect: false,
      clamped: false,
    });
  });

  // The flag stays only while something else explains it (core's
  // staysSuspectAfterReopen).
  it('clears the "stock was probably wrong" flag unless it stays suspect', () => {
    expect(reverse({ stock: 0, stockSuspect: true }, -120, false).stockSuspect).toBe(false);
    expect(reverse({ stock: 0, stockSuspect: true }, -120, true).stockSuspect).toBe(true);
  });

  it("never sets the flag", () => {
    expect(reverse({ stock: 0, stockSuspect: false }, -120, true).stockSuspect).toBe(false);
  });

  it("reverses a movement that removed nothing with a zero delta", () => {
    expect(reverse({ stock: 0, stockSuspect: true }, 0, true).delta).toBe(0);
  });
});
