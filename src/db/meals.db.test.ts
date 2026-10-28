import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { MealTypeSeedKey } from "@/core/meal-types";
import type { CategorySeedKey } from "@/core/food-categories";
import { createCategory, getCategory, listActiveCategories, removeCategory } from "./food-categories";
import { createMealTemplate, deleteMealTemplate, updateMealTemplate } from "./meal-templates";
import { createMealType, getMealType, listActiveMealTypes, removeMealType } from "./meal-types";
import {
  createMeal,
  createMealFromTemplate,
  deleteMeal,
  getMeal,
  listMeals,
  setMealSlotCategory,
  setMealUntracked,
  updateMeal,
} from "./meals";
import { mealSlots } from "./schema";
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

async function seededCategoryId(seedKey: CategorySeedKey): Promise<string> {
  const category = (await listActiveCategories(db)).find((c) => c.seedKey === seedKey);
  if (!category) throw new Error(`No seeded ${seedKey}`);
  return category.id;
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

describe("createMealFromTemplate", () => {
  it("copies the template's name, Meal Type, hour and slots, empty and in order", async () => {
    const lunchId = await seededMealTypeId("lunch");
    const [grains, vegetables, fruit] = await Promise.all([
      seededCategoryId("grains"),
      seededCategoryId("vegetables"),
      seededCategoryId("fruit"),
    ]);
    const template = await createMealTemplate(db, {
      name: "Office Lunch",
      hour: "12:30",
      mealTypeId: lunchId,
      slotCategoryIds: [vegetables, grains, fruit],
    });

    const meal = await createMealFromTemplate(db, { date: "2026-11-03", templateId: template.id });

    const created = await getMeal(db, meal!.id);
    expect(created).toMatchObject({
      date: "2026-11-03",
      hour: "12:30",
      name: "Office Lunch",
      mealTypeId: lunchId,
      status: "planned",
      untracked: false,
    });
    expect(created?.slots.map((slot) => [slot.slotCategoryId, slot.content])).toEqual([
      [vegetables, "empty"],
      [grains, "empty"],
      [fruit, "empty"],
    ]);
  });

  it("copies a template with no slots as a Meal with none", async () => {
    const template = await createMealTemplate(db, {
      name: "Coffee",
      hour: "16:00",
      mealTypeId: await seededMealTypeId("snack"),
      slotCategoryIds: [],
    });

    const meal = await createMealFromTemplate(db, { date: "2026-11-03", templateId: template.id });

    expect((await getMeal(db, meal!.id))?.slots).toEqual([]);
  });

  it("keeps the Meal as created when the template is edited, then deleted", async () => {
    const dinnerId = await seededMealTypeId("dinner");
    const [grains, fruit] = await Promise.all([seededCategoryId("grains"), seededCategoryId("fruit")]);
    const template = await createMealTemplate(db, {
      name: "Light Dinner",
      hour: "19:30",
      mealTypeId: dinnerId,
      slotCategoryIds: [grains],
    });
    const meal = await createMealFromTemplate(db, { date: "2026-11-04", templateId: template.id });

    await updateMealTemplate(db, template.id, {
      name: "Big Dinner",
      hour: "20:30",
      mealTypeId: await seededMealTypeId("lunch"),
      slotCategoryIds: [fruit, fruit],
    });
    await deleteMealTemplate(db, template.id);

    const kept = await getMeal(db, meal!.id);
    expect(kept).toMatchObject({ name: "Light Dinner", hour: "19:30", mealTypeId: dinnerId });
    expect(kept?.slots.map((slot) => slot.slotCategoryId)).toEqual([grains]);
  });

  it("creates nothing from a template that is gone", async () => {
    expect(
      await createMealFromTemplate(db, { date: "2026-11-04", templateId: "00000000-0000-4000-8000-000000000000" }),
    ).toBeUndefined();
  });
});

describe("setMealSlotCategory", () => {
  it("changes one slot's Slot Category, keeping its place", async () => {
    const [grains, vegetables, fruit] = await Promise.all([
      seededCategoryId("grains"),
      seededCategoryId("vegetables"),
      seededCategoryId("fruit"),
    ]);
    const template = await createMealTemplate(db, {
      name: "Lunch Box",
      hour: "12:00",
      mealTypeId: await seededMealTypeId("lunch"),
      slotCategoryIds: [grains, vegetables],
    });
    const meal = await createMealFromTemplate(db, { date: "2026-11-05", templateId: template.id });
    const [first] = (await getMeal(db, meal!.id))!.slots;

    await setMealSlotCategory(db, first!.id, fruit);

    const slots = (await getMeal(db, meal!.id))!.slots;
    expect(slots.map((slot) => slot.slotCategoryId)).toEqual([fruit, vegetables]);
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
  it("removes the Meal with its slots", async () => {
    const template = await createMealTemplate(db, {
      name: "Breakfast Plate",
      hour: "08:00",
      mealTypeId: await seededMealTypeId("breakfast"),
      slotCategoryIds: [await seededCategoryId("grains"), await seededCategoryId("fruit")],
    });
    const meal = await createMealFromTemplate(db, { date: "2026-11-06", templateId: template.id });

    await deleteMeal(db, meal!.id);

    expect(await getMeal(db, meal!.id)).toBeUndefined();
    expect(await db.select().from(mealSlots).where(eq(mealSlots.mealId, meal!.id))).toEqual([]);
  });

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

describe("the Slot Category reference", () => {
  it("Archives a removed Food Category a Meal Slot uses, and the slot keeps showing it", async () => {
    const sauces = await createCategory(db, { name: "Sauces", kind: "kind" });
    const template = await createMealTemplate(db, {
      name: "Pasta Night",
      hour: "20:00",
      mealTypeId: await seededMealTypeId("dinner"),
      slotCategoryIds: [sauces.id],
    });
    const meal = await createMealFromTemplate(db, { date: "2026-11-07", templateId: template.id });
    await deleteMealTemplate(db, template.id);

    expect(await removeCategory(db, sauces.id)).toBe("archived");

    expect((await getCategory(db, sauces.id))?.archivedAt).toBeInstanceOf(Date);
    expect((await getMeal(db, meal!.id))?.slots).toMatchObject([
      { slotCategoryId: sauces.id, slotCategory: { name: "Sauces", archived: true } },
    ]);
  });

  it("still hard deletes a Food Category once its last Meal Slot is removed", async () => {
    const dips = await createCategory(db, { name: "Dips", kind: "kind" });
    const template = await createMealTemplate(db, {
      name: "Party",
      hour: "21:00",
      mealTypeId: await seededMealTypeId("snack"),
      slotCategoryIds: [dips.id],
    });
    const meal = await createMealFromTemplate(db, { date: "2026-11-07", templateId: template.id });
    await deleteMealTemplate(db, template.id);
    await deleteMeal(db, meal!.id);

    expect(await removeCategory(db, dips.id)).toBe("deleted");
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
