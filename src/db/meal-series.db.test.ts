import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { CategorySeedKey } from "@/core/food-categories";
import type { MealTypeSeedKey } from "@/core/meal-types";
import { createCategory, listActiveCategories, removeCategory } from "./food-categories";
import { createDueRepeats } from "./meal-series";
import { createMealType, listActiveMealTypes, removeMealType } from "./meal-types";
import { confirmMeal, skipMeal } from "./confirmation";
import { createMeal, deleteMeal, getMeal, listMeals, updateMeal, type Meal } from "./meals";
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
      [6, 7],
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
      await updateMeal(db, byDate.get("2026-11-11")!, { hour: "13:00", name: "Late Change", untracked: true }, undefined, [], "following"),
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

    await updateMeal(db, first!.id, { hour: "20:00", name: "Late Thursday", untracked: false }, undefined, [], "this");
    await createDueRepeats(db, "2026-11-23");

    expect((await mealsNamed("Late Thursday", "2026-12-06")).map((m) => m.date)).toEqual([TODAY]);
    expect((await mealsNamed("Thursday Dinner", "2026-12-06")).map((m) => [m.date, m.hour])).toEqual([
      [second!.date, "19:00"],
      ["2026-11-26", "19:00"],
      ["2026-12-03", "19:00"],
    ]);
  });
});
