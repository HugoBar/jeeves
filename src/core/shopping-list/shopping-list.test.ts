import { describe, expect, it } from "vitest";
import type { ProjectedMeal, ProjectedProduct } from "@/core/projected-stock";
import {
  chosenRange,
  currentChoice,
  datedShortfalls,
  generatePresets,
  isGenerateRange,
  packsCovering,
  planAddByHand,
  planGenerate,
  planUntick,
  planUntickAll,
  restockStart,
  runningLow,
  stockUncertainty,
} from "./index";

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

describe("restockStart", () => {
  it("starts at the whole packs that cover the amount", () => {
    expect(restockStart(300, 500)).toBe(500);
    expect(restockStart(1400, 1000)).toBe(2000);
  });

  it("starts at the amount when it is whole packs already", () => {
    expect(restockStart(1000, 500)).toBe(1000);
  });

  it("starts at the amount without a Pack Size", () => {
    expect(restockStart(150, null)).toBe(150);
  });

  it("starts empty for an item with no amount", () => {
    expect(restockStart(null, 250)).toBeNull();
    expect(restockStart(null, null)).toBeNull();
  });

  it("keeps the 2 decimals Stock holds", () => {
    expect(restockStart(0.25, 0.1)).toBe(0.3);
  });
});

describe("planUntick", () => {
  const item = (id: string, quantity: number | null, ticked = false) => ({ id, productId: "spinach", quantity, ticked });

  it("unticks the item when its Product has no other unticked item", () => {
    expect(planUntick("a", [item("a", 100, true), item("b", 50, true)])).toEqual({ kind: "untick" });
  });

  it("adds it to the Product's unticked item, so the Product still has one", () => {
    expect(planUntick("a", [item("a", 100, true), item("b", 150)])).toEqual({ kind: "merge", into: "b", quantity: 250 });
  });

  it("counts no amount as 0", () => {
    expect(planUntick("a", [item("a", null, true), item("b", 150)])).toEqual({ kind: "merge", into: "b", quantity: 150 });
    expect(planUntick("a", [item("a", 100, true), item("b", null)])).toEqual({ kind: "merge", into: "b", quantity: 100 });
  });

  it("leaves no amount when neither has one", () => {
    expect(planUntick("a", [item("a", null, true), item("b", null)])).toEqual({ kind: "merge", into: "b", quantity: null });
  });
});

describe("planUntickAll", () => {
  const item = (id: string, productId: string, quantity: number | null, ticked: boolean) => ({ id, productId, quantity, ticked });

  it("unticks every item whose Product has only that one", () => {
    expect(planUntickAll([item("a", "rice", 100, true), item("b", "oats", null, true)])).toEqual({
      keep: [
        { id: "a", quantity: 100 },
        { id: "b", quantity: null },
      ],
      remove: [],
    });
  });

  it("adds a Product's items into its unticked one, so it has one item", () => {
    expect(
      planUntickAll([item("a", "spinach", 100, true), item("b", "spinach", 150, false), item("c", "spinach", 50, true)]),
    ).toEqual({ keep: [{ id: "b", quantity: 300 }], remove: ["a", "c"] });
  });

  it("adds ticked items into the first of them when none is unticked, counting no amount as 0", () => {
    expect(planUntickAll([item("a", "eggs", 6, true), item("b", "eggs", null, true)])).toEqual({
      keep: [{ id: "a", quantity: 6 }],
      remove: ["b"],
    });
  });

  it("leaves no amount when none of a Product's items has one", () => {
    expect(planUntickAll([item("a", "salt", null, true), item("b", "salt", null, true)])).toEqual({
      keep: [{ id: "a", quantity: null }],
      remove: ["b"],
    });
  });
});

// Wednesday 11 Nov 2026: the Planner covers 9-22 Nov.
describe("generatePresets", () => {
  it("offers the planned week, the next week and both", () => {
    expect(generatePresets("2026-11-11")).toEqual({
      planned: { from: "2026-11-09", to: "2026-11-15" },
      next: { from: "2026-11-16", to: "2026-11-22" },
      both: { from: "2026-11-09", to: "2026-11-22" },
    });
  });
});

describe("isGenerateRange", () => {
  it("takes any dates in the Planner's two weeks, From on or before To", () => {
    expect(isGenerateRange("2026-11-11", { from: "2026-11-09", to: "2026-11-22" })).toBe(true);
    expect(isGenerateRange("2026-11-11", { from: "2026-11-12", to: "2026-11-17" })).toBe(true);
    expect(isGenerateRange("2026-11-11", { from: "2026-11-20", to: "2026-11-20" })).toBe(true);
  });

  it("refuses From after To", () => {
    expect(isGenerateRange("2026-11-11", { from: "2026-11-18", to: "2026-11-17" })).toBe(false);
  });

  it("refuses dates outside the two weeks", () => {
    expect(isGenerateRange("2026-11-11", { from: "2026-11-08", to: "2026-11-15" })).toBe(false);
    expect(isGenerateRange("2026-11-11", { from: "2026-11-16", to: "2026-11-23" })).toBe(false);
  });

  it("refuses text that isn't a date", () => {
    expect(isGenerateRange("2026-11-11", { from: "2026-11-09", to: "soon" })).toBe(false);
  });
});

describe("chosenRange", () => {
  it("gives a preset's dates on the viewer's date", () => {
    expect(chosenRange({ preset: "next" }, "2026-11-11")).toEqual({ from: "2026-11-16", to: "2026-11-22" });
    expect(chosenRange({ preset: "next" }, "2026-11-16")).toEqual({ from: "2026-11-23", to: "2026-11-29" });
  });

  it("gives dates of your own as they are", () => {
    const own = { preset: null, range: { from: "2026-11-12", to: "2026-11-17" } };
    expect(chosenRange(own, "2026-11-11")).toEqual({ from: "2026-11-12", to: "2026-11-17" });
  });
});

describe("currentChoice", () => {
  const own = { preset: null, range: { from: "2026-11-12", to: "2026-11-17" } };

  it("keeps dates of your own while they lie in the Planner's two weeks", () => {
    expect(currentChoice(own, "2026-11-11")).toEqual(own);
  });

  it("goes back to the planned week once the viewer's date leaves dates of your own behind", () => {
    expect(currentChoice(own, "2026-11-16")).toEqual({ preset: "planned" });
  });

  it("keeps a preset, whose dates follow the viewer's date", () => {
    expect(currentChoice({ preset: "next" }, "2026-11-16")).toEqual({ preset: "next" });
  });
});

describe("stockUncertainty", () => {
  // Wednesday 11 Nov 2026, for the viewer.
  const today = "2026-11-11";
  const meal = (
    date: string,
    productIds: string[],
    { status = "planned", untracked = false }: { status?: "planned" | "confirmed" | "skipped"; untracked?: boolean } = {},
  ) => ({ status, date, untracked, productIds });

  it("counts Meals whose day has passed unconfirmed and flags the Products they use", () => {
    const result = stockUncertainty([meal("2026-11-09", ["salmon", "rice"]), meal("2026-11-10", ["rice", "spinach"])], today);
    expect(result.unconfirmed).toBe(2);
    expect([...result.productIds].sort()).toEqual(["rice", "salmon", "spinach"]);
  });

  it("leaves out Meals from today on, and Meals Confirmed or Skipped", () => {
    const result = stockUncertainty(
      [
        meal("2026-11-11", ["salmon"]),
        meal("2026-11-12", ["rice"]),
        meal("2026-11-09", ["spinach"], { status: "confirmed" }),
        meal("2026-11-09", ["milk"], { status: "skipped" }),
      ],
      today,
    );
    expect(result).toEqual({ unconfirmed: 0, productIds: new Set() });
  });

  it("counts an Untracked Meal but flags none of its Products", () => {
    const result = stockUncertainty([meal("2026-11-10", ["salmon"], { untracked: true })], today);
    expect(result).toEqual({ unconfirmed: 1, productIds: new Set() });
  });
});

// Rice in grams with 500 g in Stock, eggs in pieces with 6.
const stocked = new Map<string, ProjectedProduct>([
  ["rice", { defaultUnit: "g", density: null, stock: 500 }],
  ["eggs", { defaultUnit: "pc", density: null, stock: 6 }],
]);

// A tracked, Planned Lunch on `date`, its one slot taking `quantity` of a Product.
function takes(id: string, date: string, productId: string, quantity: number, fields: Partial<ProjectedMeal> = {}): ProjectedMeal {
  return {
    id,
    date,
    hour: "12:00",
    createdAt: new Date("2026-11-01T10:00:00Z"),
    priority: 2,
    status: "planned",
    untracked: false,
    slots: [{ id: `${id}-slot`, content: "product", productId, quantity }],
    ...fields,
  };
}

describe("datedShortfalls", () => {
  it("adds up a Product's Shortfalls on one day, as the Planner works them out", () => {
    const meals = [
      takes("lunch", "2026-11-10", "rice", 800),
      takes("dinner", "2026-11-10", "rice", 100, { hour: "19:30", priority: 3 }),
      takes("next-day", "2026-11-11", "rice", 50),
      takes("eggs", "2026-11-12", "eggs", 10),
    ];

    expect(datedShortfalls(meals, stocked)).toEqual([
      { productId: "rice", date: "2026-11-10", amount: 400 },
      { productId: "rice", date: "2026-11-11", amount: 50 },
      { productId: "eggs", date: "2026-11-12", amount: 4 },
    ]);
  });

  it("leaves out Untracked Meals, which take no Stock", () => {
    const meals = [takes("lunch", "2026-11-10", "rice", 800, { untracked: true })];

    expect(datedShortfalls(meals, stocked)).toEqual([]);
  });
});

describe("runningLow", () => {
  // The Planner's two weeks on Wed 11 Nov 2026.
  const weeks = { from: "2026-11-09", to: "2026-11-22" };
  // A to Z, as the add field lists them.
  const products = [
    { id: "basil", stock: 0 },
    { id: "eggs", stock: 2 },
    { id: "milk", stock: 0 },
    { id: "oil", stock: 300 },
    { id: "rice", stock: 500 },
  ];

  it("lists Products at 0 Stock first, then those short by the first day they are short", () => {
    const shortfalls = [
      { productId: "oil", date: "2026-11-12", amount: 100 },
      { productId: "eggs", date: "2026-11-10", amount: 4 },
      { productId: "eggs", date: "2026-11-12", amount: 2 },
      { productId: "milk", date: "2026-11-10", amount: 200 },
    ];

    expect(runningLow(products, shortfalls, new Set(), weeks)).toEqual([
      { productId: "basil", reason: { kind: "outOfStock" } },
      { productId: "milk", reason: { kind: "outOfStock" } },
      { productId: "eggs", reason: { kind: "short", date: "2026-11-10", amount: 4 } },
      { productId: "oil", reason: { kind: "short", date: "2026-11-12", amount: 100 } },
    ]);
  });

  it("leaves out Products with an item on the list, ticked or not", () => {
    const shortfalls = [{ productId: "eggs", date: "2026-11-10", amount: 4 }];

    expect(runningLow(products, shortfalls, new Set(["basil", "eggs"]), weeks)).toEqual([
      { productId: "milk", reason: { kind: "outOfStock" } },
    ]);
  });

  it("counts only Shortfalls in the Planner's two weeks", () => {
    const shortfalls = [
      { productId: "eggs", date: "2026-11-08", amount: 4 },
      { productId: "oil", date: "2026-11-23", amount: 100 },
      { productId: "rice", date: "2026-11-22", amount: 50 },
    ];

    expect(runningLow(products, shortfalls, new Set(["basil", "milk"]), weeks)).toEqual([
      { productId: "rice", reason: { kind: "short", date: "2026-11-22", amount: 50 } },
    ]);
  });

  it("says the first day a Product is short, whatever order the Shortfalls come in", () => {
    const shortfalls = [
      { productId: "eggs", date: "2026-11-12", amount: 2 },
      { productId: "eggs", date: "2026-11-10", amount: 4 },
    ];

    expect(runningLow(products, shortfalls, new Set(["basil", "milk"]), weeks)).toEqual([
      { productId: "eggs", reason: { kind: "short", date: "2026-11-10", amount: 4 } },
    ]);
  });

  it("lists nothing when nothing is running low", () => {
    expect(runningLow([{ id: "rice", stock: 500 }], [], new Set(), weeks)).toEqual([]);
  });
});
