import { describe, expect, it } from "vitest";
import { packsCovering, planAddByHand, planGenerate } from "./index";

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

describe("planAddByHand", () => {
  // Coffee beans, sold in 250 g bags.
  const bag = 250;
  const item = (id: string, quantity: number | null, ticked = false) => ({ id, productId: "coffee", quantity, ticked });

  it("puts one pack on a new item when the Product isn't on the list", () => {
    expect(planAddByHand(bag, [])).toEqual({ kind: "add", quantity: 250 });
  });

  it("adds the pack to the unticked item, whatever made it", () => {
    expect(planAddByHand(bag, [item("a", 100)])).toEqual({ kind: "raise", id: "a", quantity: 350 });
  });

  it("counts an unticked item with no amount as 0", () => {
    expect(planAddByHand(bag, [item("a", null)])).toEqual({ kind: "raise", id: "a", quantity: 250 });
  });

  it("puts the pack on a new item beside ticked ones, leaving them as they are", () => {
    expect(planAddByHand(bag, [item("a", 500, true)])).toEqual({ kind: "add", quantity: 250 });
  });

  it("adds to the unticked item when ticked ones sit beside it", () => {
    expect(planAddByHand(bag, [item("a", 500, true), item("b", 250)])).toEqual({ kind: "raise", id: "b", quantity: 500 });
  });

  it("puts a Product without a Pack Size on with no amount", () => {
    expect(planAddByHand(null, [])).toEqual({ kind: "add", quantity: null });
    expect(planAddByHand(null, [item("a", 500, true)])).toEqual({ kind: "add", quantity: null });
  });

  it("leaves the unticked item of a Product without a Pack Size as it is", () => {
    expect(planAddByHand(null, [item("a", 150)])).toEqual({ kind: "keep", id: "a" });
  });
});
