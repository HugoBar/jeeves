import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { CategorySeedKey } from "@/core/food-categories";
import type { MealTypeSeedKey } from "@/core/meal-types";
import { createCategory, listActiveCategories, removeCategory } from "./food-categories";
import { createDueRepeats } from "./meal-series";
import { createMealType, listActiveMealTypes, removeMealType } from "./meal-types";
import { confirmMeal, skipMeal } from "./confirmation";
import {
  addMealSlot,
  createMeal,
  deleteMeal,
  fillMealSlot,
  getMeal,
  listMeals,
  updateMeal,
  type Meal,
} from "./meals";
import { createProduct } from "./products";
import { mealSeries } from "./schema";
import { createTestDb } from "./test-database";

let db: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  db = await createTestDb();
});

// 2026-11-12 is a Thursday; the planner then runs to Sunday 22 November.
const TODAY = "2026-11-12";

async function seededMealTypeId(seedKey: MealTypeSeedKey): Promise<string> {
  const mealType = (await listActiveMealTypes(db)).find((m) => m.seedKey === seedKey);
  if (!mealType) throw new Error(`No seeded ${seedKey}`);
  return mealType.id;
}

async function seededCategoryId(seedKey: CategorySeedKey): Promise<string> {
  const category = (await listActiveCategories(db)).find((c) => c.seedKey === seedKey);
  if (!category) throw new Error(`No seeded ${seedKey}`);
  return category.id;
}

// The Meals named `name` from TODAY's Monday to `to`, by date.
async function mealsNamed(name: string, to = "2026-11-22"): Promise<Meal[]> {
  return (await listMeals(db, "2026-11-09", to))
    .filter((meal) => meal.name === name)
    .sort((a, b) => a.date.localeCompare(b.date));
}

describe("a Meal Series started on New Meal", () => {
  it("creates repeats copying its name, Meal Type, hour, Untracked and empty slots", async () => {
    const [grains, mainDish] = await Promise.all([seededCategoryId("grains"), seededCategoryId("main_dish")]);
    const productResult = await createProduct(db, {
      name: "Series Bread",
      defaultUnit: "g",
      density: null,
      packSize: null,
      categoryIds: [grains],
    });
    if (!productResult.ok) throw new Error(productResult.error);
    const dinnerId = await seededMealTypeId("dinner");

    await createMeal(
      db,
      { date: TODAY, hour: "19:30", name: "Weeknight", mealTypeId: dinnerId, untracked: true },
      [
        { slotCategoryId: mainDish, fill: { content: "empty" } },
        { slotCategoryId: grains, fill: { content: "product", productId: productResult.product.id, quantity: 80 } },
      ],
      [1, 3, 5],
    );
    await createDueRepeats(db, TODAY);

    const meals = await mealsNamed("Weeknight");
    expect(meals.map((meal) => meal.date)).toEqual(["2026-11-12", "2026-11-13", "2026-11-16", "2026-11-18", "2026-11-20"]);
    for (const repeat of meals.slice(1)) {
      expect(repeat).toMatchObject({ hour: "19:30", mealTypeId: dinnerId, untracked: true, status: "planned" });
      expect(repeat.slots.map((slot) => [slot.slotCategoryId, slot.content])).toEqual([
        [mainDish, "empty"],
        [grains, "empty"],
      ]);
    }
    // The starting Meal keeps its food, and every Meal shows the series' days.
    expect(meals[0]!.slots[1]!.content).toBe("product");
    expect(meals.map((meal) => meal.repeats)).toEqual(meals.map(() => [1, 3, 5]));
  });
});

describe("createDueRepeats", () => {
  it("creates each repeat once, never brings back one deleted on its own, and adds a new week's", async () => {
    const lunchId = await seededMealTypeId("lunch");
    await createMeal(db, { date: TODAY, hour: "12:00", name: "Mondays", mealTypeId: lunchId }, [], [1]);

    await createDueRepeats(db, TODAY);
    expect(await createDueRepeats(db, TODAY)).toBe(0);
    const [, repeat, ...more] = await mealsNamed("Mondays");
    expect([repeat!.date, more]).toEqual(["2026-11-16", []]);
    await deleteMeal(db, repeat!.id);
    expect(await createDueRepeats(db, TODAY)).toBe(0);

    // Monday the 23rd: next week is now the one ending 6 December.
    await createDueRepeats(db, "2026-11-23");
    expect((await mealsNamed("Mondays", "2026-12-06")).map((meal) => meal.date)).toEqual([
      "2026-11-12",
      "2026-11-23",
      "2026-11-30",
    ]);
  });

  it("creates a repeat on a day that already has a Meal of the same Meal Type", async () => {
    const snack = await createMealType(db, { name: "Series Snack", priority: 4, allowsLeftovers: false });
    await createMeal(db, { date: "2026-11-17", hour: "10:00", name: "Other Snack", mealTypeId: snack.id });
    await createMeal(db, { date: TODAY, hour: "16:00", name: "Tuesday Snack", mealTypeId: snack.id }, [], [2]);

    await createDueRepeats(db, TODAY);

    expect((await mealsNamed("Tuesday Snack")).map((meal) => meal.date)).toEqual(["2026-11-12", "2026-11-17"]);
  });

  it("creates none for a series whose Meal Type is Archived", async () => {
    const brunch = await createMealType(db, { name: "Series Brunch", priority: 2, allowsLeftovers: false });
    await createMeal(db, { date: TODAY, hour: "11:00", name: "Brunch Days", mealTypeId: brunch.id }, [], [6, 7]);
    expect(await removeMealType(db, brunch.id)).toBe("archived");

    await createDueRepeats(db, TODAY);

    expect((await mealsNamed("Brunch Days")).map((meal) => meal.date)).toEqual(["2026-11-12"]);
  });

  it("copies an Archived Slot Category, which the repeat keeps until it is changed", async () => {
    const category = await createCategory(db, { name: "Series Soon Gone", kind: "role" });
    const lunchId = await seededMealTypeId("lunch");
    await createMeal(
      db,
      { date: TODAY, hour: "13:00", name: "Archived Slot", mealTypeId: lunchId },
      [{ slotCategoryId: category.id, fill: { content: "empty" } }],
      [5],
    );
    expect(await removeCategory(db, category.id)).toBe("archived");

    await createDueRepeats(db, TODAY);

    const [, repeat] = await mealsNamed("Archived Slot");
    expect(repeat!.slots.map((slot) => [slot.slotCategoryId, slot.slotCategory.archived])).toEqual([[category.id, true]]);
  });
});

describe("a Meal Series started on Edit Meal", () => {
  it("copies the Meal as saved, with its slot changes", async () => {
    const [grains, mainDish] = await Promise.all([seededCategoryId("grains"), seededCategoryId("main_dish")]);
    const meal = await createMeal(
      db,
      { date: "2026-11-14", hour: "08:00", name: null, mealTypeId: await seededMealTypeId("breakfast") },
      [
        { slotCategoryId: grains, fill: { content: "empty" } },
        { slotCategoryId: mainDish, fill: { content: "empty" } },
      ],
    );
    const [first, second] = (await getMeal(db, meal.id))!.slots;

    await updateMeal(
      db,
      meal.id,
      { hour: "08:30", name: "Weekend Breakfast", untracked: false },
      { removed: [first!.id], order: [second!.id], slotCategories: [] },
      { repeatOn: { weekdays: [6, 7], today: TODAY } },
    );
    await createDueRepeats(db, TODAY);

    const meals = await mealsNamed("Weekend Breakfast");
    expect(meals.map((m) => [m.date, m.hour, m.repeats])).toEqual([
      ["2026-11-14", "08:30", [6, 7]],
      ["2026-11-15", "08:30", [6, 7]],
      ["2026-11-21", "08:30", [6, 7]],
      ["2026-11-22", "08:30", [6, 7]],
    ]);
    expect(meals[1]!.slots.map((slot) => slot.slotCategoryId)).toEqual([mainDish]);
  });
});

describe("deleting a Meal of a Meal Series", () => {
  it("\"this and all following\" deletes it and every later Planned repeat, and ends the series", async () => {
    const lunchId = await seededMealTypeId("lunch");
    // Started on Monday the 9th, so its repeats run from the 10th to the 22nd.
    await createMeal(db, { date: "2026-11-09", hour: "12:00", name: "Daily Ending", mealTypeId: lunchId }, [], [1, 2, 3, 4, 5, 6, 7]);
    await createDueRepeats(db, "2026-11-09");
    const byDate = new Map((await mealsNamed("Daily Ending")).map((meal) => [meal.date, meal]));
    expect(await skipMeal(db, byDate.get("2026-11-10")!.id, TODAY)).toBe(true);
    expect(await confirmMeal(db, byDate.get("2026-11-12")!.id, { untracked: true, today: TODAY })).toEqual({ ok: true });

    await deleteMeal(db, byDate.get("2026-11-11")!.id, "following");

    const left = await mealsNamed("Daily Ending");
    expect(left.map((meal) => [meal.date, meal.status, meal.repeats])).toEqual([
      ["2026-11-09", "planned", [1, 2, 3, 4, 5, 6, 7]],
      ["2026-11-10", "skipped", [1, 2, 3, 4, 5, 6, 7]],
      ["2026-11-12", "confirmed", [1, 2, 3, 4, 5, 6, 7]],
    ]);
    // Ended: a new week brings no new repeats.
    await createDueRepeats(db, "2026-11-23");
    expect((await mealsNamed("Daily Ending", "2026-12-06")).map((meal) => meal.date)).toEqual(["2026-11-09", "2026-11-10", "2026-11-12"]);
  });

  it("removes a series once its last Meal is deleted with \"only this one\", so it stops repeating", async () => {
    const dinnerId = await seededMealTypeId("dinner");
    // Sunday the 22nd only: the planner shows no other Sunday after it.
    const meal = await createMeal(db, { date: "2026-11-22", hour: "19:00", name: "Lone Sunday", mealTypeId: dinnerId }, [], [7]);
    await createDueRepeats(db, TODAY);
    expect((await mealsNamed("Lone Sunday")).map((m) => m.date)).toEqual(["2026-11-22"]);

    await deleteMeal(db, meal.id, "this");

    await createDueRepeats(db, "2026-11-23");
    expect(await mealsNamed("Lone Sunday", "2026-12-06")).toEqual([]);
  });

  it("removes an ended series once no Meal belongs to it", async () => {
    const lunchId = await seededMealTypeId("lunch");
    const meal = await createMeal(db, { date: TODAY, hour: "12:00", name: "All Gone", mealTypeId: lunchId }, [], [4]);
    await createDueRepeats(db, TODAY);
    const [series] = await db.select({ id: mealSeries.id }).from(mealSeries).where(eq(mealSeries.name, "All Gone"));

    await deleteMeal(db, meal.id, "following");

    expect(await mealsNamed("All Gone")).toEqual([]);
    expect(await db.select().from(mealSeries).where(eq(mealSeries.id, series!.id))).toEqual([]);
  });

  it("\"only this one\" leaves the rest of the series repeating", async () => {
    const lunchId = await seededMealTypeId("lunch");
    await createMeal(db, { date: TODAY, hour: "12:00", name: "Gap Thursday", mealTypeId: lunchId }, [], [4]);
    await createDueRepeats(db, TODAY);
    const [, repeat] = await mealsNamed("Gap Thursday");

    await deleteMeal(db, repeat!.id, "this");
    await createDueRepeats(db, "2026-11-23");

    expect((await mealsNamed("Gap Thursday", "2026-12-06")).map((m) => m.date)).toEqual(["2026-11-12", "2026-11-26", "2026-12-03"]);
  });
});

describe("changing a Meal of a Meal Series", () => {
  it("\"this and all following\" rewrites it and every later Planned repeat to match the series, even ones edited on their own", async () => {
    const lunchId = await seededMealTypeId("lunch");
    // Started on Monday the 9th, so its repeats run from the 10th to the 22nd.
    await createMeal(db, { date: "2026-11-09", hour: "12:00", name: "Daily Change", mealTypeId: lunchId }, [], [1, 2, 3, 4, 5, 6, 7]);
    await createDueRepeats(db, "2026-11-09");
    const byDate = new Map((await mealsNamed("Daily Change")).map((meal) => [meal.date, meal.id]));
    expect(await skipMeal(db, byDate.get("2026-11-10")!, TODAY)).toBe(true);
    expect(await confirmMeal(db, byDate.get("2026-11-12")!, { untracked: true, today: TODAY })).toEqual({ ok: true });
    await updateMeal(db, byDate.get("2026-11-14")!, { hour: "14:00", name: "Saturday Change", untracked: false });

    expect(
      await updateMeal(db, byDate.get("2026-11-11")!, { hour: "13:00", name: "Late Change", untracked: true }, undefined, { scope: "following" }),
    ).toBe(true);

    const shown = async (date: string) => {
      const meal = (await getMeal(db, byDate.get(date)!))!;
      return [meal.hour, meal.name, meal.untracked, meal.status];
    };
    expect(await shown("2026-11-09")).toEqual(["12:00", "Daily Change", false, "planned"]);
    expect(await shown("2026-11-10")).toEqual(["12:00", "Daily Change", false, "skipped"]);
    expect(await shown("2026-11-11")).toEqual(["13:00", "Late Change", true, "planned"]);
    expect(await shown("2026-11-12")).toEqual(["12:00", "Daily Change", true, "confirmed"]);
    expect(await shown("2026-11-14")).toEqual(["13:00", "Late Change", true, "planned"]);
    expect(await shown("2026-11-22")).toEqual(["13:00", "Late Change", true, "planned"]);
    // New repeats copy the series as changed.
    await createDueRepeats(db, "2026-11-23");
    const next = (await listMeals(db, "2026-11-23", "2026-11-29")).filter((meal) => meal.name === "Late Change");
    expect(next.map((meal) => [meal.hour, meal.untracked])).toEqual(Array(7).fill(["13:00", true]));
  });

  it("\"only this one\" changes only that Meal, and new repeats keep the series as it was", async () => {
    const dinnerId = await seededMealTypeId("dinner");
    await createMeal(db, { date: TODAY, hour: "19:00", name: "Thursday Dinner", mealTypeId: dinnerId }, [], [4]);
    await createDueRepeats(db, TODAY);
    const [first, second] = await mealsNamed("Thursday Dinner");

    await updateMeal(db, first!.id, { hour: "20:00", name: "Late Thursday", untracked: false }, undefined, { scope: "this" });
    await createDueRepeats(db, "2026-11-23");

    expect((await mealsNamed("Late Thursday", "2026-12-06")).map((m) => m.date)).toEqual([TODAY]);
    expect((await mealsNamed("Thursday Dinner", "2026-12-06")).map((m) => [m.date, m.hour])).toEqual([
      [second!.date, "19:00"],
      ["2026-11-26", "19:00"],
      ["2026-12-03", "19:00"],
    ]);
  });
});

describe("changing the slots of a Meal of a Meal Series", () => {
  const KEYS = ["main_dish", "salad", "grains", "soup", "fruit"] as const;

  async function seriesCategories() {
    const ids = await Promise.all(KEYS.map(seededCategoryId));
    return {
      ids: Object.fromEntries(KEYS.map((key, index) => [key, ids[index]!])) as Record<(typeof KEYS)[number], string>,
      names: new Map(ids.map((id, index) => [id, KEYS[index]!])),
    };
  }

  // What a Meal's slots show: each Slot Category's seed key and what it holds.
  async function slotsOf(id: string, names: Map<string, string>) {
    const meal = (await getMeal(db, id))!;
    return meal.slots.map((slot) => [
      names.get(slot.slotCategoryId),
      slot.content === "product" ? slot.product.name : slot.content,
    ]);
  }

  async function seriesProduct(name: string, categoryId: string): Promise<string> {
    const result = await createProduct(db, { name, defaultUnit: "g", density: null, packSize: null, categoryIds: [categoryId] });
    if (!result.ok) throw new Error(result.error);
    return result.product.id;
  }

  const UNCHANGED = { hour: "12:00", name: "Slot Lunch", untracked: false };

  it("\"this and all following\" gives the series this Meal's slots and rewrites every later Planned repeat, keeping food by series slot", async () => {
    const lunchId = await seededMealTypeId("lunch");
    const { ids, names } = await seriesCategories();
    const stew = await seriesProduct("Slot Stew", ids.main_dish);
    const greens = await seriesProduct("Slot Greens", ids.salad);
    const apple = await seriesProduct("Slot Apple", ids.fruit);
    // Started on Monday the 9th, so its repeats run from the 10th to the 22nd.
    await createMeal(
      db,
      { ...UNCHANGED, date: "2026-11-09", mealTypeId: lunchId },
      [ids.main_dish, ids.salad, ids.grains].map((slotCategoryId) => ({ slotCategoryId, fill: { content: "empty" } as const })),
      [1, 2, 3, 4, 5, 6, 7],
    );
    await createDueRepeats(db, "2026-11-09");
    const byDate = new Map((await mealsNamed("Slot Lunch")).map((meal) => [meal.date, meal]));
    const id = (date: string) => byDate.get(date)!.id;
    const slotIds = (date: string) => byDate.get(date)!.slots.map((slot) => slot.id);
    await fillMealSlot(db, slotIds("2026-11-11")[0]!, { content: "product", productId: stew, quantity: 200 });
    expect(await skipMeal(db, id("2026-11-10"), TODAY)).toBe(true);
    expect(await confirmMeal(db, id("2026-11-12"), { untracked: true, today: TODAY })).toEqual({ ok: true });
    // The 14th: food in its main dish and salad, and a slot of its own.
    await fillMealSlot(db, slotIds("2026-11-14")[0]!, { content: "product", productId: stew, quantity: 200 });
    await fillMealSlot(db, slotIds("2026-11-14")[1]!, { content: "product", productId: greens, quantity: 50 });
    await addMealSlot(db, id("2026-11-14"), { slotCategoryId: ids.fruit, fill: { content: "product", productId: apple, quantity: 100 } });
    // The 15th, on its own: grains moved first.
    const [main15, salad15, grains15] = slotIds("2026-11-15");
    await updateMeal(db, id("2026-11-15"), UNCHANGED, { removed: [], order: [grains15!, main15!, salad15!], slotCategories: [] });
    // The 13th, a Friday, has a fruit slot of its own before it is changed.
    await addMealSlot(db, id("2026-11-13"), { slotCategoryId: ids.fruit, fill: { content: "empty" } });
    const [main13, salad13, grains13, fruit13] = (await getMeal(db, id("2026-11-13")))!.slots.map((slot) => slot.id);

    // Salad removed, grains moved first, main dish made a soup.
    const saved = await updateMeal(
      db,
      id("2026-11-13"),
      UNCHANGED,
      { removed: [salad13!], order: [grains13!, main13!, fruit13!], slotCategories: [{ slotId: main13!, slotCategoryId: ids.soup }] },
      { scope: "following" },
    );

    expect(saved).toBe(true);
    const asChanged = [["grains", "empty"], ["soup", "empty"], ["fruit", "empty"]];
    expect(await slotsOf(id("2026-11-13"), names)).toEqual(asChanged);
    // Food stays with the series slot it came from; a slot of its own goes, with its food.
    expect(await slotsOf(id("2026-11-14"), names)).toEqual([["grains", "empty"], ["soup", "Slot Stew"], ["fruit", "empty"]]);
    expect(await slotsOf(id("2026-11-15"), names)).toEqual(asChanged);
    expect(await slotsOf(id("2026-11-22"), names)).toEqual(asChanged);
    // Earlier, Skipped and Confirmed Meals never change.
    const asStarted = [["main_dish", "empty"], ["salad", "empty"], ["grains", "empty"]];
    expect(await slotsOf(id("2026-11-09"), names)).toEqual(asStarted);
    expect(await slotsOf(id("2026-11-10"), names)).toEqual(asStarted);
    expect(await slotsOf(id("2026-11-11"), names)).toEqual([["main_dish", "Slot Stew"], ["salad", "empty"], ["grains", "empty"]]);
    expect(await slotsOf(id("2026-11-12"), names)).toEqual(asStarted);
    // New repeats copy the series as changed.
    await createDueRepeats(db, "2026-11-23");
    const [next] = (await listMeals(db, "2026-11-23", "2026-11-23")).filter((meal) => meal.name === "Slot Lunch");
    expect(await slotsOf(next!.id, names)).toEqual(asChanged);
  });

  it("\"this and all following\" with only the hour changed still makes later repeats' slots match the series", async () => {
    const dinnerId = await seededMealTypeId("dinner");
    const { ids, names } = await seriesCategories();
    await createMeal(
      db,
      { date: TODAY, hour: "19:00", name: "Slot Dinner", mealTypeId: dinnerId },
      [{ slotCategoryId: ids.soup, fill: { content: "empty" } }],
      [4],
    );
    await createDueRepeats(db, TODAY);
    const [first, second] = await mealsNamed("Slot Dinner");
    await addMealSlot(db, second!.id, { slotCategoryId: ids.fruit, fill: { content: "empty" } });

    await updateMeal(db, first!.id, { hour: "20:00", name: "Slot Dinner", untracked: false }, undefined, { scope: "following" });

    expect(await slotsOf(second!.id, names)).toEqual([["soup", "empty"]]);
  });

  it("\"only this one\" changes only that Meal's slots, and new repeats keep the series' slots", async () => {
    const dinnerId = await seededMealTypeId("dinner");
    const { ids, names } = await seriesCategories();
    await createMeal(
      db,
      { date: TODAY, hour: "19:00", name: "Slot Supper", mealTypeId: dinnerId },
      [ids.soup, ids.main_dish].map((slotCategoryId) => ({ slotCategoryId, fill: { content: "empty" } as const })),
      [4],
    );
    await createDueRepeats(db, TODAY);
    const [first] = await mealsNamed("Slot Supper");
    const [soup, main] = first!.slots.map((slot) => slot.id);

    await updateMeal(
      db,
      first!.id,
      { hour: "19:00", name: "Slot Supper", untracked: false },
      { removed: [soup!], order: [main!], slotCategories: [] },
      { scope: "this" },
    );
    await createDueRepeats(db, "2026-11-23");

    const meals = await mealsNamed("Slot Supper", "2026-12-06");
    expect(meals.map((meal) => meal.date)).toEqual([TODAY, "2026-11-19", "2026-11-26", "2026-12-03"]);
    expect(await slotsOf(first!.id, names)).toEqual([["main_dish", "empty"]]);
    for (const meal of meals.slice(1)) {
      expect(await slotsOf(meal.id, names)).toEqual([["soup", "empty"], ["main_dish", "empty"]]);
    }
  });

});

describe("changing \"Repeat on\" from a Meal of a Meal Series", () => {
  it("adds repeats only on newly ticked days and removes them only on newly unticked days, from this Meal on", async () => {
    const [lunchId, mainDish] = await Promise.all([seededMealTypeId("lunch"), seededCategoryId("main_dish")]);
    // Started on Monday the 9th, so its repeats run from the 10th to the 20th.
    await createMeal(
      db,
      { date: "2026-11-09", hour: "12:00", name: "Desk Lunch", mealTypeId: lunchId },
      [{ slotCategoryId: mainDish, fill: { content: "empty" } }],
      [1, 2, 3, 4, 5],
    );
    await createDueRepeats(db, "2026-11-09");
    const byDate = new Map((await mealsNamed("Desk Lunch")).map((meal) => [meal.date, meal.id]));
    await updateMeal(db, byDate.get("2026-11-16")!, { hour: "14:00", name: "Desk Lunch", untracked: false });

    // From Friday the 13th: Tuesday unticked, Saturday ticked.
    const saved = await updateMeal(db, byDate.get("2026-11-13")!, { hour: "12:00", name: "Desk Lunch", untracked: false }, undefined, {
      repeatOn: { weekdays: [1, 3, 4, 5, 6], today: TODAY },
    });

    expect(saved).toBe(true);
    const meals = await mealsNamed("Desk Lunch");
    expect(meals.map((meal) => [meal.date, meal.hour, meal.repeats])).toEqual([
      ["2026-11-09", "12:00", [1, 3, 4, 5, 6]],
      ["2026-11-10", "12:00", [1, 3, 4, 5, 6]],
      ["2026-11-11", "12:00", [1, 3, 4, 5, 6]],
      ["2026-11-12", "12:00", [1, 3, 4, 5, 6]],
      ["2026-11-13", "12:00", [1, 3, 4, 5, 6]],
      ["2026-11-14", "12:00", [1, 3, 4, 5, 6]],
      ["2026-11-16", "14:00", [1, 3, 4, 5, 6]],
      ["2026-11-18", "12:00", [1, 3, 4, 5, 6]],
      ["2026-11-19", "12:00", [1, 3, 4, 5, 6]],
      ["2026-11-20", "12:00", [1, 3, 4, 5, 6]],
      ["2026-11-21", "12:00", [1, 3, 4, 5, 6]],
    ]);
    expect(meals[5]!.slots.map((slot) => [slot.slotCategoryId, slot.content])).toEqual([[mainDish, "empty"]]);
    // A new week repeats on the new days.
    await createDueRepeats(db, "2026-11-23");
    const next = (await listMeals(db, "2026-11-23", "2026-11-29")).filter((meal) => meal.name === "Desk Lunch");
    expect(next.map((meal) => meal.date).sort()).toEqual(["2026-11-23", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28"]);
  });

  it("unticking every day ends the series from this Meal, which leaves it", async () => {
    const dinnerId = await seededMealTypeId("dinner");
    await createMeal(db, { date: "2026-11-09", hour: "19:00", name: "Daily Stop", mealTypeId: dinnerId }, [], [1, 2, 3, 4, 5, 6, 7]);
    await createDueRepeats(db, "2026-11-09");
    const byDate = new Map((await mealsNamed("Daily Stop")).map((meal) => [meal.date, meal.id]));
    expect(await confirmMeal(db, byDate.get("2026-11-12")!, { untracked: true, today: TODAY })).toEqual({ ok: true });

    await updateMeal(db, byDate.get("2026-11-13")!, { hour: "19:00", name: "Daily Stop", untracked: false }, undefined, {
      repeatOn: { weekdays: [], today: TODAY },
    });

    const left = await mealsNamed("Daily Stop");
    expect(left.map((meal) => [meal.date, meal.status, meal.repeats])).toEqual([
      ["2026-11-09", "planned", [1, 2, 3, 4, 5, 6, 7]],
      ["2026-11-10", "planned", [1, 2, 3, 4, 5, 6, 7]],
      ["2026-11-11", "planned", [1, 2, 3, 4, 5, 6, 7]],
      ["2026-11-12", "confirmed", [1, 2, 3, 4, 5, 6, 7]],
      ["2026-11-13", "planned", null],
    ]);
    // Earlier Meals keep the ended series, as started.
    expect(left[0]!.series).toEqual({ startedOn: "2026-11-09", ended: true });
    expect(left[4]!.series).toBeNull();
    await createDueRepeats(db, "2026-11-23");
    expect((await mealsNamed("Daily Stop", "2026-12-06")).map((meal) => meal.date)).toEqual([
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
    ]);
  });

  it("removes the series when the Meal unticking every day was its last", async () => {
    const lunchId = await seededMealTypeId("lunch");
    const meal = await createMeal(db, { date: "2026-11-22", hour: "12:00", name: "Last Sunday", mealTypeId: lunchId }, [], [7]);
    const [series] = await db.select({ id: mealSeries.id }).from(mealSeries).where(eq(mealSeries.name, "Last Sunday"));

    await updateMeal(db, meal.id, { hour: "12:00", name: "Last Sunday", untracked: false }, undefined, {
      repeatOn: { weekdays: [], today: TODAY },
    });

    expect((await getMeal(db, meal.id))!.repeats).toBeNull();
    expect(await db.select().from(mealSeries).where(eq(mealSeries.id, series!.id))).toEqual([]);
  });
});
