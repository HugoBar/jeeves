import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { MealTypeSeedKey } from "@/core/meal-types";
import {
  createMealTemplate,
  deleteMealTemplate,
  getMealTemplate,
  listMealTemplates,
  updateMealTemplate,
} from "./meal-templates";
import { listMealTypes } from "./meal-types";
import { mealTypes } from "./schema";
import { createTestDb } from "./test-database";

let db: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  db = await createTestDb();
});

async function seededMealTypeId(seedKey: MealTypeSeedKey): Promise<string> {
  const mealType = (await listMealTypes(db)).find((m) => m.seedKey === seedKey);
  if (!mealType) throw new Error(`No seeded ${seedKey}`);
  return mealType.id;
}

describe("createMealTemplate", () => {
  it("saves a name, an hour and a Meal Type", async () => {
    const lunchId = await seededMealTypeId("lunch");

    const template = await createMealTemplate(db, { name: "Weekday Lunch", hour: "12:30", mealTypeId: lunchId });

    expect(await getMealTemplate(db, template.id)).toEqual({
      id: template.id,
      name: "Weekday Lunch",
      hour: "12:30",
      mealTypeId: lunchId,
    });
  });

  it("lets several templates share a Meal Type", async () => {
    const dinnerId = await seededMealTypeId("dinner");

    const weekday = await createMealTemplate(db, { name: "Weekday Dinner", hour: "19:30", mealTypeId: dinnerId });
    const weekend = await createMealTemplate(db, { name: "Weekend Dinner", hour: "20:00", mealTypeId: dinnerId });

    const listed = await listMealTemplates(db);
    expect(listed.filter((template) => template.mealTypeId === dinnerId).map((template) => template.id)).toEqual(
      expect.arrayContaining([weekday.id, weekend.id]),
    );
  });

  it("rejects a Meal Type that does not exist", async () => {
    await expect(
      createMealTemplate(db, {
        name: "Nowhere",
        hour: "08:00",
        mealTypeId: "00000000-0000-4000-8000-000000000000",
      }),
    ).rejects.toThrow();
  });
});

describe("updateMealTemplate", () => {
  it("changes the name, hour and Meal Type", async () => {
    const template = await createMealTemplate(db, {
      name: "Morning Snack",
      hour: "10:00",
      mealTypeId: await seededMealTypeId("snack"),
    });
    const breakfastId = await seededMealTypeId("breakfast");

    await updateMealTemplate(db, template.id, { name: "Late Breakfast", hour: "10:30", mealTypeId: breakfastId });

    expect(await getMealTemplate(db, template.id)).toEqual({
      id: template.id,
      name: "Late Breakfast",
      hour: "10:30",
      mealTypeId: breakfastId,
    });
  });
});

describe("deleteMealTemplate", () => {
  it("hard deletes the template", async () => {
    const template = await createMealTemplate(db, {
      name: "Quick Breakfast",
      hour: "07:15",
      mealTypeId: await seededMealTypeId("breakfast"),
    });

    await deleteMealTemplate(db, template.id);

    expect(await getMealTemplate(db, template.id)).toBeUndefined();
    expect((await listMealTemplates(db)).map((t) => t.id)).not.toContain(template.id);
  });
});

describe("meal_templates.meal_type_id", () => {
  // ON DELETE RESTRICT, never CASCADE: removing a Meal Type must never take
  // its templates with it.
  it("blocks deleting a Meal Type that a template uses", async () => {
    const [brunch] = await db.insert(mealTypes).values({ name: "Brunch", priority: 2 }).returning();
    const template = await createMealTemplate(db, { name: "Sunday Brunch", hour: "11:00", mealTypeId: brunch!.id });

    await expect(db.delete(mealTypes).where(eq(mealTypes.id, brunch!.id))).rejects.toThrow();
    expect(await getMealTemplate(db, template.id)).toBeDefined();
  });
});
