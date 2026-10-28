import { beforeAll, describe, expect, it } from "vitest";
import type { MealTypeSeedKey } from "@/core/meal-types";
import { createMealType, getMealType, listActiveMealTypes, removeMealType } from "./meal-types";
import { createMeal, deleteMeal, getMeal, listMeals, setMealUntracked, updateMeal } from "./meals";
import { createTestDb } from "./test-database";

let db: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  db = await createTestDb();
});

async function seededMealTypeId(seedKey: MealTypeSeedKey): Promise<string> {
  const mealType = (await listActiveMealTypes(db)).find((m) => m.seedKey === seedKey);
  if (!mealType) throw new Error(`No seeded ${seedKey}`);
  return mealType.id;
}

describe("createMeal", () => {
  it("saves a Planned, tracked Meal on a day with a Meal Type and an hour", async () => {
    const lunchId = await seededMealTypeId("lunch");

    const meal = await createMeal(db, { date: "2026-10-27", hour: "12:30", name: null, mealTypeId: lunchId });

    expect(await getMeal(db, meal.id)).toMatchObject({
      id: meal.id,
      date: "2026-10-27",
      hour: "12:30",
      name: null,
      mealTypeId: lunchId,
      status: "planned",
      untracked: false,
      mealType: { seedKey: "lunch", name: null, archived: false },
    });
  });

  it("allows several Meals of one Meal Type on the same day", async () => {
    const snackId = await seededMealTypeId("snack");

    const morning = await createMeal(db, { date: "2026-10-28", hour: "10:00", name: "Morning Snack", mealTypeId: snackId });
    const afternoon = await createMeal(db, { date: "2026-10-28", hour: "16:00", name: null, mealTypeId: snackId });

    const listed = await listMeals(db, "2026-10-28", "2026-10-28");
    expect(listed.map((meal) => meal.id)).toEqual(expect.arrayContaining([morning.id, afternoon.id]));
  });

  it("rejects a Meal Type that does not exist", async () => {
    await expect(
      createMeal(db, {
        date: "2026-10-27",
        hour: "08:00",
        name: null,
        mealTypeId: "00000000-0000-4000-8000-000000000000",
      }),
    ).rejects.toThrow();
  });
});

describe("listMeals", () => {
  it("lists only the Meals from the first day to the last, both included", async () => {
    const dinnerId = await seededMealTypeId("dinner");
    const before = await createMeal(db, { date: "2026-12-06", hour: "19:00", name: null, mealTypeId: dinnerId });
    const first = await createMeal(db, { date: "2026-12-07", hour: "19:00", name: null, mealTypeId: dinnerId });
    const last = await createMeal(db, { date: "2026-12-20", hour: "19:00", name: null, mealTypeId: dinnerId });
    const after = await createMeal(db, { date: "2026-12-21", hour: "19:00", name: null, mealTypeId: dinnerId });

    const ids = (await listMeals(db, "2026-12-07", "2026-12-20")).map((meal) => meal.id);

    expect(ids).toEqual(expect.arrayContaining([first.id, last.id]));
    expect(ids).not.toContain(before.id);
    expect(ids).not.toContain(after.id);
  });
});

describe("updateMeal", () => {
  it("changes the hour and name, keeping the Meal Type", async () => {
    const lunchId = await seededMealTypeId("lunch");
    const meal = await createMeal(db, { date: "2026-10-29", hour: "12:30", name: null, mealTypeId: lunchId });

    await updateMeal(db, meal.id, { hour: "13:15", name: "Late Lunch" });

    expect(await getMeal(db, meal.id)).toMatchObject({ hour: "13:15", name: "Late Lunch", mealTypeId: lunchId });
  });

  it("clears the name", async () => {
    const meal = await createMeal(db, {
      date: "2026-10-29",
      hour: "10:00",
      name: "Brunch",
      mealTypeId: await seededMealTypeId("breakfast"),
    });

    await updateMeal(db, meal.id, { hour: "10:00", name: null });

    expect((await getMeal(db, meal.id))?.name).toBeNull();
  });
});

describe("setMealUntracked", () => {
  it("marks a Meal Untracked and back", async () => {
    const meal = await createMeal(db, {
      date: "2026-10-30",
      hour: "20:00",
      name: "Eating out",
      mealTypeId: await seededMealTypeId("dinner"),
    });

    await setMealUntracked(db, meal.id, true);
    expect((await getMeal(db, meal.id))?.untracked).toBe(true);

    await setMealUntracked(db, meal.id, false);
    expect((await getMeal(db, meal.id))?.untracked).toBe(false);
  });
});

describe("deleteMeal", () => {
  it("removes the Meal", async () => {
    const meal = await createMeal(db, {
      date: "2026-10-31",
      hour: "08:00",
      name: null,
      mealTypeId: await seededMealTypeId("breakfast"),
    });

    await deleteMeal(db, meal.id);

    expect(await getMeal(db, meal.id)).toBeUndefined();
  });
});

describe("the Meal Type reference", () => {
  it("Archives a removed Meal Type a Meal uses, and the Meal keeps showing it", async () => {
    const brunch = await createMealType(db, { name: "Brunch", priority: 2, allowsLeftovers: false });
    const meal = await createMeal(db, { date: "2026-11-01", hour: "11:00", name: null, mealTypeId: brunch.id });

    expect(await removeMealType(db, brunch.id)).toBe("archived");

    expect((await getMealType(db, brunch.id))?.archivedAt).toBeInstanceOf(Date);
    expect(await getMeal(db, meal.id)).toMatchObject({
      mealTypeId: brunch.id,
      mealType: { name: "Brunch", archived: true },
    });
  });

  it("still hard deletes a Meal Type once its last Meal is removed", async () => {
    const supper = await createMealType(db, { name: "Supper", priority: 3, allowsLeftovers: false });
    const meal = await createMeal(db, { date: "2026-11-01", hour: "22:00", name: null, mealTypeId: supper.id });
    await deleteMeal(db, meal.id);

    expect(await removeMealType(db, supper.id)).toBe("deleted");
  });
});
