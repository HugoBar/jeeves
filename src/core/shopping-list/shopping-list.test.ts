import { describe, expect, it } from "vitest";
import type { ProjectedMeal, ProjectedProduct } from "@/core/projected-stock";
import {
  chosenRange,
  currentChoice,
  datedShortfalls,
  datedUnknowns,
  earlierShortfalls,
  generatePresets,
  isGenerateRange,
  packsAmount,
  packsCovering,
  parseItemAmount,
  planAddByHand,
  planGenerate,
  planUntick,
  planUntickAll,
  restockStart,
  shortfallsBetween,
  runningLow,
  stepItemAmount,
  stockUncertainty,
  type ListedItem,
} from "./index";

// Spinach, 250 g short (spec "Shopping List"), every need worked out.
const short = { short: new Map([["spinach", 250]]), unknown: new Set<string>() };

describe("planGenerate", () => {
  const nothing = { add: [], set: [], remove: [] };
  const notShort = { short: new Map<string, number>(), unknown: new Set<string>() };
  // An unticked item of Spinach from Shortfalls, unless `fields` say otherwise.
  const item = (id: string, quantity: number | null, fields: Partial<ListedItem> = {}): ListedItem => ({
    id,
    productId: "spinach",
    quantity,
    ticked: false,
    source: "shortfall",
    ...fields,
  });
  const ticked = { ticked: true };
  const byHand = { source: "manual" } as const;

  it("adds a Product that is short and not on the list", () => {
    expect(planGenerate(short, [])).toEqual({ ...nothing, add: [{ productId: "spinach", quantity: 250 }] });
  });

  it("raises an unticked item from Shortfalls to the Shortfall", () => {
    expect(planGenerate(short, [item("a", 100)])).toEqual({ ...nothing, set: [{ id: "a", quantity: 250 }] });
  });

  it("lowers an unticked item from Shortfalls to the Shortfall", () => {
    // Generated over both weeks, now over this week only.
    expect(planGenerate(short, [item("a", 400)])).toEqual({ ...nothing, set: [{ id: "a", quantity: 250 }] });
  });

  it("lowers an unticked item from Shortfalls to what ticked items leave short", () => {
    expect(planGenerate(short, [item("a", 100, ticked), item("b", 250)])).toEqual({
      ...nothing,
      set: [{ id: "b", quantity: 150 }],
    });
  });

  it("removes an unticked item from Shortfalls whose Product is not short", () => {
    // Its Meal Skipped, or first generated for other dates.
    expect(planGenerate(notShort, [item("a", 100)])).toEqual({ ...nothing, remove: ["a"] });
  });

  it("removes an unticked item from Shortfalls when ticked items cover the Shortfall", () => {
    expect(planGenerate(short, [item("a", 100, ticked), item("b", 150, ticked), item("c", 50)])).toEqual({
      ...nothing,
      remove: ["c"],
    });
  });

  it("leaves an item as it is when its Product's need can't be worked out", () => {
    const unknown = { short: new Map<string, number>(), unknown: new Set(["spinach"]) };
    expect(planGenerate(unknown, [item("a", 100), item("b", 50, ticked)])).toEqual(nothing);
  });

  it("raises an unticked item added by hand below the Shortfall", () => {
    expect(planGenerate(short, [item("a", 100, byHand)])).toEqual({ ...nothing, set: [{ id: "a", quantity: 250 }] });
  });

  it("counts an item with no amount as 0", () => {
    expect(planGenerate(short, [item("a", null, byHand)])).toEqual({ ...nothing, set: [{ id: "a", quantity: 250 }] });
  });

  it("never lowers or removes an unticked item added by hand", () => {
    // 2 bags of 500 g set by hand, 250 g short.
    expect(planGenerate(short, [item("a", 1000, byHand)])).toEqual(nothing);
    expect(planGenerate(notShort, [item("a", 1000, byHand)])).toEqual(nothing);
    expect(planGenerate(short, [item("a", 300, ticked), item("b", 100, byHand)])).toEqual(nothing);
  });

  it("never changes a ticked item, and adds what it leaves short", () => {
    expect(planGenerate(short, [item("a", 100, ticked)])).toEqual({
      ...nothing,
      add: [{ productId: "spinach", quantity: 150 }],
    });
    expect(planGenerate(notShort, [item("a", 100, ticked), item("b", 50, { ...ticked, ...byHand })])).toEqual(nothing);
    expect(planGenerate(short, [item("a", 300, ticked)])).toEqual(nothing);
  });

  it("changes nothing when run again on what it made", () => {
    const shortfalls = { short: new Map([["spinach", 250], ["rice", 80]]), unknown: new Set<string>() };
    const before = [item("a", 400), item("o", 60, { productId: "oats" })];
    expect(planGenerate(shortfalls, before)).toEqual({
      add: [{ productId: "rice", quantity: 80 }],
      set: [{ id: "a", quantity: 250 }],
      remove: ["o"],
    });
    const after = [item("a", 250), item("r", 80, { productId: "rice" })];
    expect(planGenerate(shortfalls, after)).toEqual(nothing);
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
  const item = (id: string, quantity: number | null, ticked = false) => ({
    id,
    productId: "coffee",
    quantity,
    ticked,
    source: "shortfall" as const,
  });

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

  it("starts at the packs set on the list", () => {
    expect(restockStart(packsAmount(3, 500), 500)).toBe(1500);
    expect(restockStart(packsAmount(3, 0.1), 0.1)).toBe(0.3);
  });
});

describe("packsAmount", () => {
  it("is the packs times the Pack Size amount", () => {
    expect(packsAmount(2, 500)).toBe(1000);
  });

  it("keeps the 2 decimals Stock holds, and reads back as the same packs", () => {
    expect(packsAmount(3, 0.1)).toBe(0.3);
    expect(packsCovering(packsAmount(3, 0.1), 0.1)).toBe(3);
    expect(packsCovering(packsAmount(7, 0.33), 0.33)).toBe(7);
  });
});

describe("stepItemAmount", () => {
  it("adds or takes off a whole pack, from the packs shown", () => {
    // 100 g shows as 1 bag of 500 g.
    expect(stepItemAmount(100, 500, "g", 1)).toBe(1000);
    expect(stepItemAmount(1400, 1000, "ml", -1)).toBe(1000);
  });

  it("never goes below 1 pack", () => {
    expect(stepItemAmount(500, 500, "g", -1)).toBeNull();
    expect(stepItemAmount(100, 500, "g", -1)).toBeNull();
  });

  it("starts at 1 pack for an item with no amount", () => {
    expect(stepItemAmount(null, 500, "g", 1)).toBe(500);
    expect(stepItemAmount(null, 500, "g", -1)).toBeNull();
  });

  it("steps by 100 g or ml, or by 1 pc, without a Pack Size", () => {
    expect(stepItemAmount(150, null, "g", 1)).toBe(250);
    expect(stepItemAmount(600, null, "ml", -1)).toBe(500);
    expect(stepItemAmount(3, null, "pc", 1)).toBe(4);
  });

  it("never goes below a single step without a Pack Size", () => {
    expect(stepItemAmount(150, null, "g", -1)).toBe(100);
    expect(stepItemAmount(100, null, "g", -1)).toBeNull();
    expect(stepItemAmount(1, null, "pc", -1)).toBeNull();
  });

  it("starts at one step for an item with no amount, without a Pack Size", () => {
    expect(stepItemAmount(null, null, "g", 1)).toBe(100);
    expect(stepItemAmount(null, null, "pc", -1)).toBeNull();
  });
});

describe("parseItemAmount", () => {
  it("reads whole packs with a Pack Size, stored in the Default Unit", () => {
    expect(parseItemAmount(" 2 ", 500)).toEqual({ ok: true, quantity: 1000 });
  });

  it("refuses packs that are not whole or not above 0", () => {
    for (const typed of ["0", "-1", "1.5", "", "two"]) {
      expect(parseItemAmount(typed, 500)).toEqual({ ok: false, error: "notWholePacks" });
    }
  });

  it("refuses more packs than the list can hold", () => {
    expect(parseItemAmount("1000000", 500)).toEqual({ ok: false, error: "notWholePacks" });
  });

  it("reads an amount as Restock does without a Pack Size", () => {
    expect(parseItemAmount("600", null)).toEqual({ ok: true, quantity: 600 });
    expect(parseItemAmount("0.255", null)).toEqual({ ok: true, quantity: 0.26 });
  });

  it("refuses an amount of 0 or below without a Pack Size", () => {
    for (const typed of ["0", "-5", ""]) {
      expect(parseItemAmount(typed, null)).toEqual({ ok: false, error: "notAboveZero" });
    }
  });
});

describe("planUntick", () => {
  const item = (id: string, quantity: number | null, ticked = false, source: "shortfall" | "manual" = "shortfall") => ({
    id,
    productId: "spinach",
    quantity,
    ticked,
    source,
  });

  it("unticks the item when its Product has no other unticked item", () => {
    expect(planUntick("a", [item("a", 100, true), item("b", 50, true)])).toEqual({ kind: "untick" });
  });

  it("adds it to the Product's unticked item, so the Product still has one", () => {
    expect(planUntick("a", [item("a", 100, true), item("b", 150)])).toEqual({
      kind: "merge",
      into: "b",
      quantity: 250,
      source: "shortfall",
    });
  });

  it("leaves the item it adds into added by hand if either was", () => {
    expect(planUntick("a", [item("a", 100, true, "manual"), item("b", 150)])).toMatchObject({ source: "manual" });
    expect(planUntick("a", [item("a", 100, true), item("b", 150, false, "manual")])).toMatchObject({ source: "manual" });
  });

  it("counts no amount as 0", () => {
    expect(planUntick("a", [item("a", null, true), item("b", 150)])).toEqual({
      kind: "merge",
      into: "b",
      quantity: 150,
      source: "shortfall",
    });
    expect(planUntick("a", [item("a", 100, true), item("b", null)])).toEqual({
      kind: "merge",
      into: "b",
      quantity: 100,
      source: "shortfall",
    });
  });

  it("leaves no amount when neither has one", () => {
    expect(planUntick("a", [item("a", null, true), item("b", null)])).toEqual({
      kind: "merge",
      into: "b",
      quantity: null,
      source: "shortfall",
    });
  });
});

describe("planUntickAll", () => {
  const item = (
    id: string,
    productId: string,
    quantity: number | null,
    ticked: boolean,
    source: "shortfall" | "manual" = "shortfall",
  ) => ({ id, productId, quantity, ticked, source });

  it("unticks every item whose Product has only that one", () => {
    expect(planUntickAll([item("a", "rice", 100, true), item("b", "oats", null, true, "manual")])).toEqual({
      keep: [
        { id: "a", quantity: 100, source: "shortfall" },
        { id: "b", quantity: null, source: "manual" },
      ],
      remove: [],
    });
  });

  it("adds a Product's items into its unticked one, so it has one item", () => {
    expect(
      planUntickAll([item("a", "spinach", 100, true), item("b", "spinach", 150, false), item("c", "spinach", 50, true)]),
    ).toEqual({ keep: [{ id: "b", quantity: 300, source: "shortfall" }], remove: ["a", "c"] });
  });

  it("leaves the item kept added by hand if any of its Product's items was", () => {
    expect(
      planUntickAll([item("a", "spinach", 100, true, "manual"), item("b", "spinach", 150, false), item("c", "oats", 50, true)]),
    ).toEqual({
      keep: [
        { id: "b", quantity: 250, source: "manual" },
        { id: "c", quantity: 50, source: "shortfall" },
      ],
      remove: ["a"],
    });
  });

  it("adds ticked items into the first of them when none is unticked, counting no amount as 0", () => {
    expect(planUntickAll([item("a", "eggs", 6, true), item("b", "eggs", null, true)])).toEqual({
      keep: [{ id: "a", quantity: 6, source: "shortfall" }],
      remove: ["b"],
    });
  });

  it("leaves no amount when none of a Product's items has one", () => {
    expect(planUntickAll([item("a", "salt", null, true), item("b", "salt", null, true)])).toEqual({
      keep: [{ id: "a", quantity: null, source: "shortfall" }],
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

describe("earlierShortfalls", () => {
  // The weekend of 21-22 Nov.
  const weekend = { from: "2026-11-21", to: "2026-11-22" };

  it("adds up what earlier Meals are short of, for a Product short in the range too", () => {
    // Stock 2 Garlic: the week before needs 8, the weekend 3.
    const shortfalls = [
      { productId: "garlic", date: "2026-11-16", amount: 2 },
      { productId: "garlic", date: "2026-11-18", amount: 4 },
      { productId: "garlic", date: "2026-11-21", amount: 3 },
    ];

    expect(earlierShortfalls(shortfalls, [], weekend)).toEqual(new Map([["garlic", 6]]));
  });

  it("follows Restock, while Generate keeps asking for the same", () => {
    // Garlic in pieces. A past Meal, still Unconfirmed, and one the week
    // before need 8 between them; the weekend needs 3.
    const meals = [
      takes("past", "2026-11-05", "garlic", 2),
      takes("week", "2026-11-18", "garlic", 6),
      takes("weekend", "2026-11-21", "garlic", 3),
    ];
    const garlic = (stock: number) => new Map<string, ProjectedProduct>([["garlic", { defaultUnit: "pc", density: null, stock }]]);
    const note = (stock: number) =>
      earlierShortfalls(datedShortfalls(meals, garlic(stock)), datedUnknowns(meals, garlic(stock)), weekend);

    expect(note(2)).toEqual(new Map([["garlic", 6]]));
    expect(shortfallsBetween(meals, garlic(2), weekend.from, weekend.to).short).toEqual(new Map([["garlic", 3]]));
    // Restocking the 3 Generate asked for.
    expect(note(5)).toEqual(new Map([["garlic", 3]]));
    expect(shortfallsBetween(meals, garlic(5), weekend.from, weekend.to).short).toEqual(new Map([["garlic", 3]]));
  });

  it("names only Products short both before and within the range", () => {
    const shortfalls = [
      { productId: "onion", date: "2026-11-16", amount: 2 },
      { productId: "basil", date: "2026-11-21", amount: 20 },
      { productId: "garlic", date: "2026-11-10", amount: 1 },
      { productId: "garlic", date: "2026-11-22", amount: 3 },
    ];

    expect(earlierShortfalls(shortfalls, [], weekend)).toEqual(new Map([["garlic", 1]]));
  });

  it("leaves out a Product whose need can't be worked out in the range, as Generate does", () => {
    const shortfalls = [
      { productId: "flour", date: "2026-11-16", amount: 200 },
      { productId: "flour", date: "2026-11-21", amount: 100 },
    ];
    const unknown = [{ productId: "flour", date: "2026-11-22" }];

    expect(earlierShortfalls(shortfalls, unknown, weekend)).toEqual(new Map());
  });

  it("still names a Product whose need is unknown only before the range", () => {
    const shortfalls = [
      { productId: "flour", date: "2026-11-16", amount: 200 },
      { productId: "flour", date: "2026-11-21", amount: 100 },
    ];
    const unknown = [{ productId: "flour", date: "2026-11-17" }];

    expect(earlierShortfalls(shortfalls, unknown, weekend)).toEqual(new Map([["flour", 200]]));
  });

  it("names nothing when nothing is short before the range", () => {
    expect(earlierShortfalls([{ productId: "garlic", date: "2026-11-21", amount: 3 }], [], weekend)).toEqual(new Map());
  });
});

describe("shortfallsBetween", () => {
  // Flour in grams with no Density, so a cup of it can't be worked out.
  const withFlour = new Map<string, ProjectedProduct>([
    ...stocked,
    ["flour", { defaultUnit: "g", density: null, stock: 0 }],
  ]);
  const bakes = (id: string, date: string): ProjectedMeal => ({
    ...takes(id, date, "flour", 0),
    slots: [
      {
        id: `${id}-slot`,
        content: "recipe",
        portions: 2,
        recipe: { portions: 2, ingredients: [{ productId: "flour", amount: 1, unit: "cup" }] },
      },
    ],
  });

  it("names apart the Products whose need can't be worked out in the range, short or not", () => {
    const meals = [bakes("lunch", "2026-11-10"), takes("flour", "2026-11-11", "flour", 200), takes("rice", "2026-11-11", "rice", 800)];

    expect(shortfallsBetween(meals, withFlour, "2026-11-09", "2026-11-15")).toEqual({
      short: new Map([["rice", 300]]),
      unknown: new Set(["flour"]),
    });
  });

  it("names none for a need that can't be worked out outside the range", () => {
    const meals = [bakes("lunch", "2026-11-05"), takes("flour", "2026-11-11", "flour", 200)];

    expect(shortfallsBetween(meals, withFlour, "2026-11-09", "2026-11-15")).toEqual({
      short: new Map([["flour", 200]]),
      unknown: new Set(),
    });
  });
});

describe("datedUnknowns", () => {
  // Flour in grams with no Density, so a cup of it can't be worked out.
  const withFlour = new Map<string, ProjectedProduct>([
    ...stocked,
    ["flour", { defaultUnit: "g", density: null, stock: 0 }],
  ]);
  const bakes = (id: string, date: string, fields: Partial<ProjectedMeal> = {}): ProjectedMeal => ({
    ...takes(id, date, "flour", 0),
    slots: [
      {
        id: `${id}-slot`,
        content: "recipe",
        portions: 2,
        recipe: { portions: 2, ingredients: [{ productId: "flour", amount: 1, unit: "cup" }] },
      },
    ],
    ...fields,
  });

  it("gives each day a Meal's need for a Product can't be worked out, once", () => {
    const meals = [bakes("lunch", "2026-11-10"), bakes("dinner", "2026-11-10", { hour: "19:30" }), bakes("next", "2026-11-12")];

    expect(datedUnknowns(meals, withFlour)).toEqual([
      { productId: "flour", date: "2026-11-10" },
      { productId: "flour", date: "2026-11-12" },
    ]);
  });

  it("leaves out Untracked Meals and needs that can be worked out", () => {
    const meals = [bakes("lunch", "2026-11-10", { untracked: true }), takes("rice", "2026-11-10", "rice", 800)];

    expect(datedUnknowns(meals, withFlour)).toEqual([]);
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
