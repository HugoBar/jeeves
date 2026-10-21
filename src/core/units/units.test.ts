import { describe, expect, it } from "vitest";
import { convertToDefaultUnit, roundToPacks } from "./index";

const grams = { defaultUnit: "g", density: null } as const;
const millilitres = { defaultUnit: "ml", density: null } as const;

describe("convertToDefaultUnit", () => {
  it.each([
    [250, "g", grams],
    [250, "ml", millilitres],
    [2.5, "pc", { defaultUnit: "pc", density: null }],
  ] as const)("keeps %s %s already in the Default Unit", (amount, unit, product) => {
    expect(convertToDefaultUnit(amount, unit, product)).toEqual({ ok: true, amount });
  });

  it.each([
    [2, "kg", grams, 2000],
    [1.5, "l", millilitres, 1500],
    [3, "tsp", millilitres, 15],
    [2, "tbsp", millilitres, 30],
    [2, "cup", millilitres, 500],
  ] as const)("converts %s %s within the same dimension", (amount, unit, product, expected) => {
    expect(convertToDefaultUnit(amount, unit, product)).toEqual({ ok: true, amount: expected });
  });

  it("returns clean decimals", () => {
    expect(convertToDefaultUnit(1.005, "kg", grams)).toEqual({ ok: true, amount: 1005 });
    expect(convertToDefaultUnit(0.57, "tsp", millilitres)).toEqual({ ok: true, amount: 2.85 });
  });

  it("converts mass to volume through Density", () => {
    const syrup = { defaultUnit: "ml", density: 0.5 } as const;
    expect(convertToDefaultUnit(100, "g", syrup)).toEqual({ ok: true, amount: 200 });
  });

  it("converts volume to mass through Density", () => {
    const oil = { defaultUnit: "g", density: 0.92 } as const;
    expect(convertToDefaultUnit(1, "cup", oil)).toEqual({ ok: true, amount: 230 });
  });

  it("changes unit and dimension in one step", () => {
    const honey = { defaultUnit: "ml", density: 1.4 } as const;
    expect(convertToDefaultUnit(0.7, "kg", honey)).toEqual({ ok: true, amount: 500 });
    const oil = { defaultUnit: "g", density: 0.92 } as const;
    expect(convertToDefaultUnit(2, "tbsp", oil)).toEqual({ ok: true, amount: 27.6 });
  });

  it.each([
    [100, "g", millilitres],
    [1, "cup", grams],
    [100, "g", { defaultUnit: "ml", density: 0 }],
    [100, "g", { defaultUnit: "ml", density: -1 }],
  ] as const)("fails converting %s %s without a usable Density", (amount, unit, product) => {
    expect(convertToDefaultUnit(amount, unit, product)).toEqual({
      ok: false,
      error: { code: "noDensity" },
    });
  });

  it.each([
    ["pc", { defaultUnit: "g", density: 1 }, "count", "mass"],
    ["pc", { defaultUnit: "ml", density: 1 }, "count", "volume"],
    ["kg", { defaultUnit: "pc", density: 1 }, "mass", "count"],
    ["cup", { defaultUnit: "pc", density: 1 }, "volume", "count"],
  ] as const)("never converts %s to a %o Product", (unit, product, from, to) => {
    expect(convertToDefaultUnit(1, unit, product)).toEqual({
      ok: false,
      error: { code: "countMismatch", from, to },
    });
  });
});

describe("roundToPacks", () => {
  it("rounds up to whole packs and keeps the real amount", () => {
    expect(roundToPacks(1300, 1000)).toEqual({ packs: 2, needed: 1300, packedAmount: 2000 });
  });

  it("does not round up an exact multiple", () => {
    expect(roundToPacks(2000, 1000)).toEqual({ packs: 2, needed: 2000, packedAmount: 2000 });
  });

  it("needs no packs for nothing", () => {
    expect(roundToPacks(0, 1000)).toEqual({ packs: 0, needed: 0, packedAmount: 0 });
  });

  it("is not thrown off by float noise", () => {
    expect(roundToPacks(2.1, 0.7)).toEqual({ packs: 3, needed: 2.1, packedAmount: 2.1 });
    expect(roundToPacks(0.25, 0.1)).toEqual({ packs: 3, needed: 0.25, packedAmount: 0.3 });
  });

  it.each([0, -500])("rejects a Pack Size of %s", (packSize) => {
    expect(() => roundToPacks(1300, packSize)).toThrow(RangeError);
  });

  it.each([-1300, NaN])("rejects an amount of %s", (amount) => {
    expect(() => roundToPacks(amount, 1000)).toThrow(RangeError);
  });
});
