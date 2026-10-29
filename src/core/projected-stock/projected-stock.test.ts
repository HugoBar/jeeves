import { describe, expect, it } from "vitest";
import { projectStock, shortfallUrgency, type ProjectedMeal, type ProjectedProduct, type ProjectedRecipe } from "./index";

// Products by id: rice in grams with 500 g in Stock, milk in millilitres
// (1.03 g/ml) with 1000 ml, eggs in pieces with 6.
const products = new Map<string, ProjectedProduct>([
  ["rice", { defaultUnit: "g", density: null, stock: 500 }],
  ["milk", { defaultUnit: "ml", density: 1.03, stock: 1000 }],
  ["eggs", { defaultUnit: "pc", density: null, stock: 6 }],
]);

// A tracked, Planned Meal on 2026-11-10 at 12:00, with priority 2 (Lunch).
function aMeal(id: string, slots: ProjectedMeal["slots"], fields: Partial<ProjectedMeal> = {}): ProjectedMeal {
  return {
    id,
    date: "2026-11-10",
    hour: "12:00",
    createdAt: new Date("2026-11-01T10:00:00Z"),
    priority: 2,
    status: "planned",
    untracked: false,
    slots,
    ...fields,
  };
}

function aProductSlot(id: string, productId: string, quantity: number): ProjectedMeal["slots"][number] {
  return { id, content: "product", productId, quantity };
}

describe("projectStock", () => {
  it("finds a Shortfall when a Product slot needs more than is in Stock", () => {
    const projection = projectStock([aMeal("lunch", [aProductSlot("slot", "rice", 800)])], products);
    expect(projection.get("slot")).toEqual({ shortfalls: [{ productId: "rice", amount: 300 }], unprojectable: [] });
  });

  it("finds no Shortfall when Stock covers the slot exactly", () => {
    const projection = projectStock([aMeal("lunch", [aProductSlot("slot", "rice", 500)])], products);
    expect(projection.get("slot")).toEqual({ shortfalls: [], unprojectable: [] });
  });

  // Eating the first leaves no rice, not -300 g: the second is short only its
  // own 100 g, so Shortfalls add up to what must be bought.
  it("never lets one Meal's Shortfall count again in a later one", () => {
    const projection = projectStock(
      [
        aMeal("monday", [aProductSlot("monday-slot", "rice", 800)], { date: "2026-11-09" }),
        aMeal("tuesday", [aProductSlot("tuesday-slot", "rice", 100)], { date: "2026-11-10" }),
      ],
      products,
    );
    expect(projection.get("tuesday-slot")!.shortfalls).toEqual([{ productId: "rice", amount: 100 }]);
  });

  it("leaves empty and Leftovers slots needing nothing", () => {
    const projection = projectStock(
      [aMeal("lunch", [{ id: "empty", content: "empty" }, { id: "leftovers", content: "leftovers" }])],
      products,
    );
    expect(projection.get("empty")).toEqual({ shortfalls: [], unprojectable: [] });
    expect(projection.get("leftovers")).toEqual({ shortfalls: [], unprojectable: [] });
  });

  // An Untracked Meal is made from food outside the Pantry: it takes no
  // Stock from later Meals, and its own slots have no warnings.
  it("leaves out Untracked Meals", () => {
    const projection = projectStock(
      [
        aMeal("eaten-out", [aProductSlot("eaten-out-slot", "rice", 800)], { date: "2026-11-09", untracked: true }),
        aMeal("tuesday", [aProductSlot("tuesday-slot", "rice", 500)], { date: "2026-11-10" }),
      ],
      products,
    );
    expect(projection.has("eaten-out-slot")).toBe(false);
    expect(projection.get("tuesday-slot")!.shortfalls).toEqual([]);
  });

  // Slots of one Meal are served in their order too.
  it("lets a Meal's slots share the Stock at that Meal", () => {
    const projection = projectStock(
      [aMeal("lunch", [aProductSlot("first", "rice", 300), aProductSlot("second", "rice", 300)])],
      products,
    );
    expect(projection.get("first")!.shortfalls).toEqual([]);
    expect(projection.get("second")!.shortfalls).toEqual([{ productId: "rice", amount: 100 }]);
  });
});

describe("projectStock with Recipe slots", () => {
  // Pancakes for 4 Portions: 300 ml of milk and 2 eggs.
  const pancakes: ProjectedRecipe = {
    portions: 4,
    ingredients: [
      { productId: "milk", amount: 300, unit: "ml" },
      { productId: "eggs", amount: 2, unit: "pc" },
    ],
  };
  const aRecipeSlot = (id: string, portions: number, recipe: ProjectedRecipe = pancakes): ProjectedMeal["slots"][number] => ({
    id,
    content: "recipe",
    portions,
    recipe,
  });

  it("scales the Ingredients by the slot's Portions over the Recipe's", () => {
    // 12 Portions are 3 times the Recipe: 900 ml of milk and 6 eggs.
    const enough = projectStock([aMeal("lunch", [aRecipeSlot("slot", 12)])], products);
    expect(enough.get("slot")).toEqual({ shortfalls: [], unprojectable: [] });
    // 16 Portions: 1200 ml of milk and 8 eggs.
    const short = projectStock([aMeal("lunch", [aRecipeSlot("slot", 16)])], products);
    expect(short.get("slot")).toEqual({
      shortfalls: [
        { productId: "milk", amount: 200 },
        { productId: "eggs", amount: 2 },
      ],
      unprojectable: [],
    });
  });

  it("converts each Ingredient to its Product's Default Unit", () => {
    // 1 l is 1000 ml and 1.5 kg is 1500 g; 515 g of milk is 500 ml at 1.03 g/ml.
    const recipe: ProjectedRecipe = {
      portions: 1,
      ingredients: [
        { productId: "milk", amount: 1, unit: "l" },
        { productId: "rice", amount: 1.5, unit: "kg" },
      ],
    };
    const projection = projectStock(
      [
        aMeal("monday", [aRecipeSlot("monday-slot", 1, recipe)], { date: "2026-11-09" }),
        aMeal("tuesday", [aRecipeSlot("tuesday-slot", 1, { portions: 1, ingredients: [{ productId: "milk", amount: 515, unit: "g" }] })]),
      ],
      products,
    );
    expect(projection.get("monday-slot")!.shortfalls).toEqual([{ productId: "rice", amount: 1000 }]);
    expect(projection.get("tuesday-slot")!.shortfalls).toEqual([{ productId: "milk", amount: 500 }]);
  });

  it("adds up a Product used by several Ingredients", () => {
    const recipe: ProjectedRecipe = {
      portions: 1,
      ingredients: [
        { productId: "rice", amount: 300, unit: "g" },
        { productId: "rice", amount: 300, unit: "g" },
      ],
    };
    const projection = projectStock([aMeal("lunch", [aRecipeSlot("slot", 1, recipe)])], products);
    expect(projection.get("slot")!.shortfalls).toEqual([{ productId: "rice", amount: 100 }]);
  });

  // A Product's Density can be cleared after the Recipe was saved, and a
  // Product's Default Unit could in principle change.
  it("flags an Ingredient that cannot be converted, leaving its Product's Stock as it is", () => {
    const noDensity = new Map(products).set("rice", { defaultUnit: "g", density: null, stock: 500 });
    const recipe: ProjectedRecipe = {
      portions: 1,
      ingredients: [
        { productId: "rice", amount: 1, unit: "cup" },
        { productId: "milk", amount: 2, unit: "pc" },
        { productId: "eggs", amount: 10, unit: "pc" },
      ],
    };
    const projection = projectStock(
      [
        aMeal("monday", [aRecipeSlot("monday-slot", 1, recipe)], { date: "2026-11-09" }),
        aMeal("tuesday", [aProductSlot("tuesday-slot", "rice", 500)]),
      ],
      noDensity,
    );
    expect(projection.get("monday-slot")).toEqual({
      shortfalls: [{ productId: "eggs", amount: 4 }],
      unprojectable: ["rice", "milk"],
    });
    expect(projection.get("tuesday-slot")!.shortfalls).toEqual([]);
  });

  // Part of what the Product needs is unknown, so none of it is projected.
  it("leaves a Product's Stock as it is when only some of its Ingredients convert", () => {
    const recipe: ProjectedRecipe = {
      portions: 1,
      ingredients: [
        { productId: "eggs", amount: 10, unit: "pc" },
        { productId: "eggs", amount: 100, unit: "g" },
      ],
    };
    const projection = projectStock(
      [
        aMeal("monday", [aRecipeSlot("monday-slot", 1, recipe)], { date: "2026-11-09" }),
        aMeal("tuesday", [aProductSlot("tuesday-slot", "eggs", 6)]),
      ],
      products,
    );
    expect(projection.get("monday-slot")).toEqual({ shortfalls: [], unprojectable: ["eggs"] });
    expect(projection.get("tuesday-slot")!.shortfalls).toEqual([]);
  });

  it("flags a Product once, however many of its Ingredients cannot be converted", () => {
    const recipe: ProjectedRecipe = {
      portions: 1,
      ingredients: [
        { productId: "eggs", amount: 100, unit: "g" },
        { productId: "eggs", amount: 1, unit: "cup" },
      ],
    };
    const projection = projectStock([aMeal("lunch", [aRecipeSlot("slot", 1, recipe)])], products);
    expect(projection.get("slot")).toEqual({ shortfalls: [], unprojectable: ["eggs"] });
  });

  // 1/3 of a Recipe needing 100 g is 33.333... g; amounts are kept to 2
  // decimals (data-model Q2), so no 0.0000001 g Shortfall from float noise.
  it("rounds Shortfalls to 2 decimals and drops those that round to nothing", () => {
    const recipe: ProjectedRecipe = { portions: 3, ingredients: [{ productId: "rice", amount: 1600, unit: "g" }] };
    const projection = projectStock([aMeal("lunch", [aRecipeSlot("slot", 1, recipe)])], products);
    expect(projection.get("slot")!.shortfalls).toEqual([{ productId: "rice", amount: 33.33 }]);
    const tiny = new Map(products).set("rice", { defaultUnit: "g", density: null, stock: 0.3 });
    const exact = projectStock([aMeal("lunch", [aProductSlot("slot", "rice", 0.1 + 0.2)])], tiny);
    expect(exact.get("slot")!.shortfalls).toEqual([]);
  });
});

// Each Meal takes 400 g of the 500 g of rice, so whichever is served second
// is 300 g short.
describe("projectStock serves Meals in order", () => {
  const takesRice = (id: string, fields: Partial<ProjectedMeal>) =>
    aMeal(id, [aProductSlot(`${id}-slot`, "rice", 400)], fields);

  function shortSlots(meals: ProjectedMeal[]): string[] {
    const projection = projectStock(meals, products);
    return [...projection].filter(([, slot]) => slot.shortfalls.length > 0).map(([id]) => id);
  }

  it("on the same day, the higher Meal Priority first, whatever the hour", () => {
    const breakfast = takesRice("breakfast", { hour: "08:00", priority: 3 });
    const dinner = takesRice("dinner", { hour: "20:00", priority: 1 });
    expect(shortSlots([breakfast, dinner])).toEqual(["breakfast-slot"]);
    expect(projectStock([breakfast, dinner], products).get("breakfast-slot")!.shortfalls).toEqual([
      { productId: "rice", amount: 300 },
    ]);
  });

  it("earlier days first, whatever their Meal Priority", () => {
    const mondaySnack = takesRice("monday", { date: "2026-11-09", priority: 5 });
    const tuesdayDinner = takesRice("tuesday", { date: "2026-11-10", priority: 1 });
    expect(shortSlots([tuesdayDinner, mondaySnack])).toEqual(["tuesday-slot"]);
  });

  // An Unconfirmed Meal is still stored as Planned, however long ago its day.
  it("counts a Meal whose day has long passed, not yet Confirmed", () => {
    const unconfirmed = takesRice("unconfirmed", { date: "2026-09-01", priority: 5 });
    const today = takesRice("today", { date: "2026-11-10", priority: 1 });
    expect(shortSlots([today, unconfirmed])).toEqual(["today-slot"]);
  });

  it("on the same day and Meal Priority, the earlier hour first", () => {
    const late = takesRice("late", { hour: "13:30" });
    const early = takesRice("early", { hour: "11:00" });
    expect(shortSlots([late, early])).toEqual(["late-slot"]);
  });

  it("on the same day, Meal Priority and hour, the Meal created first", () => {
    const newer = takesRice("newer", { createdAt: new Date("2026-11-02T10:00:00Z") });
    const older = takesRice("older", { createdAt: new Date("2026-11-01T10:00:00Z") });
    expect(shortSlots([newer, older])).toEqual(["newer-slot"]);
  });
});

// Red when the Meal is 1 day away or less, amber otherwise (spec "Projected
// Stock"). `today` is the viewer's date.
describe("shortfallUrgency", () => {
  it.each([
    ["2026-11-09", "urgent", "an Unconfirmed Meal, its day passed"],
    ["2026-11-10", "urgent", "today"],
    ["2026-11-11", "urgent", "tomorrow"],
    ["2026-11-12", "upcoming", "in 2 days"],
    ["2026-11-23", "upcoming", "next week"],
  ])("on %s is %s: %s", (date, urgency) => {
    expect(shortfallUrgency(date, "2026-11-10")).toBe(urgency);
  });

  it("counts across a month's end", () => {
    expect(shortfallUrgency("2026-12-01", "2026-11-30")).toBe("urgent");
  });
});
