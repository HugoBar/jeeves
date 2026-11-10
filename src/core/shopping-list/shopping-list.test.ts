import { describe, expect, it } from "vitest";
import { packsCovering, planGenerate } from "./index";

// Spinach, 250 g short (spec "Shopping List").
const short = new Map([["spinach", 250]]);

describe("planGenerate", () => {
  it("adds a Product that is short and not on the list", () => {
    expect(planGenerate(short, [])).toEqual({ add: [{ productId: "spinach", quantity: 250 }], raise: [] });
  });

  const item = (id: string, quantity: number | null, ticked = false) => ({ id, productId: "spinach", quantity, ticked });
  const nothing = { add: [], raise: [] };

  it("raises a smaller unticked item to the Shortfall", () => {
    expect(planGenerate(short, [item("a", 100)])).toEqual({ add: [], raise: [{ id: "a", quantity: 250 }] });
  });

  it("never lowers a larger unticked item", () => {
    expect(planGenerate(short, [item("a", 300)])).toEqual(nothing);
  });

  it("counts an unticked item with no amount as 0", () => {
    expect(planGenerate(short, [item("a", null)])).toEqual({ add: [], raise: [{ id: "a", quantity: 250 }] });
  });

  it("keeps a ticked item and adds what it leaves short", () => {
    expect(planGenerate(short, [item("a", 100, true)])).toEqual({
      add: [{ productId: "spinach", quantity: 150 }],
      raise: [],
    });
  });

  it("changes nothing when ticked and unticked items already cover it", () => {
    expect(planGenerate(short, [item("a", 100, true), item("b", 150)])).toEqual(nothing);
  });

  it("changes nothing when a ticked item covers it", () => {
    expect(planGenerate(short, [item("a", 300, true)])).toEqual(nothing);
  });

  it("leaves an item whose Product is no longer short as it is", () => {
    expect(planGenerate(new Map(), [item("a", 100)])).toEqual(nothing);
  });

  it("changes nothing when run again on what it made", () => {
    const once = planGenerate(new Map([["spinach", 250], ["rice", 80]]), [item("a", 100)]);
    expect(once).toEqual({ add: [{ productId: "rice", quantity: 80 }], raise: [{ id: "a", quantity: 250 }] });
    const after = [item("a", 250), { id: "r", productId: "rice", quantity: 80, ticked: false }];
    expect(planGenerate(new Map([["spinach", 250], ["rice", 80]]), after)).toEqual(nothing);
  });
});

describe("packsCovering", () => {
  it("rounds up to whole packs", () => {
    expect(packsCovering(100, 500)).toBe(1);
    expect(packsCovering(1400, 1000)).toBe(2);
    expect(packsCovering(1000, 1000)).toBe(1);
  });

  it("is not thrown off by decimals", () => {
    expect(packsCovering(1.1, 0.1)).toBe(11);
  });
});
