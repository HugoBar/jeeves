import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { MealTypeSeedKey } from "@/core/meal-types";
import { createCategory, getCategory, removeCategory } from "./food-categories";
import {
  createMealTemplate,
  deleteMealTemplate,
  getMealTemplate,
  listMealTemplates,
  listPickableSlotCategories,
  updateMealTemplate,
} from "./meal-templates";
import { listMealTypes } from "./meal-types";
import { layoutSlots, mealTypes } from "./schema";
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

async function categoryId(name: string): Promise<string> {
  return (await createCategory(db, { name, kind: "role" })).id;
}

describe("createMealTemplate", () => {
  it("saves a name, an hour and a Meal Type", async () => {
    const lunchId = await seededMealTypeId("lunch");

    const template = await createMealTemplate(db, {
      name: "Weekday Lunch",
      hour: "12:30",
      mealTypeId: lunchId,
      slotCategoryIds: [],
    });

    expect(await getMealTemplate(db, template.id)).toEqual({
      id: template.id,
      name: "Weekday Lunch",
      hour: "12:30",
      mealTypeId: lunchId,
      slotCategoryIds: [],
    });
  });

  it("lets several templates share a Meal Type", async () => {
    const dinnerId = await seededMealTypeId("dinner");

    const weekday = await createMealTemplate(db, {
      name: "Weekday Dinner",
      hour: "19:30",
      mealTypeId: dinnerId,
      slotCategoryIds: [],
    });
    const weekend = await createMealTemplate(db, {
      name: "Weekend Dinner",
      hour: "20:00",
      mealTypeId: dinnerId,
      slotCategoryIds: [],
    });

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
        slotCategoryIds: [],
      }),
    ).rejects.toThrow();
  });

  it("keeps each slot's Slot Category in the order given", async () => {
    const [main, side] = [await categoryId("Mains"), await categoryId("Sides")];

    const template = await createMealTemplate(db, {
      name: "Family Dinner",
      hour: "19:00",
      mealTypeId: await seededMealTypeId("dinner"),
      slotCategoryIds: [side, main, side],
    });

    expect((await getMealTemplate(db, template.id))?.slotCategoryIds).toEqual([side, main, side]);
  });
});

describe("updateMealTemplate", () => {
  it("changes the name, hour and Meal Type", async () => {
    const template = await createMealTemplate(db, {
      name: "Morning Snack",
      hour: "10:00",
      mealTypeId: await seededMealTypeId("snack"),
      slotCategoryIds: [],
    });
    const breakfastId = await seededMealTypeId("breakfast");

    await updateMealTemplate(db, template.id, {
      name: "Late Breakfast",
      hour: "10:30",
      mealTypeId: breakfastId,
      slotCategoryIds: [],
    });

    expect(await getMealTemplate(db, template.id)).toEqual({
      id: template.id,
      name: "Late Breakfast",
      hour: "10:30",
      mealTypeId: breakfastId,
      slotCategoryIds: [],
    });
  });
});

describe("updateMealTemplate slots", () => {
  it("adds, removes and reorders slots, renumbering them in the order given", async () => {
    const [starter, main, dessert] = [
      await categoryId("Openers"),
      await categoryId("Centrepieces"),
      await categoryId("Sweets"),
    ];
    const template = await createMealTemplate(db, {
      name: "Sunday Lunch",
      hour: "13:00",
      mealTypeId: await seededMealTypeId("lunch"),
      slotCategoryIds: [starter, main],
    });

    await updateMealTemplate(db, template.id, {
      name: "Sunday Lunch",
      hour: "13:00",
      mealTypeId: await seededMealTypeId("lunch"),
      slotCategoryIds: [main, dessert],
    });

    expect((await getMealTemplate(db, template.id))?.slotCategoryIds).toEqual([main, dessert]);
    const positions = await db
      .select({ position: layoutSlots.position })
      .from(layoutSlots)
      .where(eq(layoutSlots.templateId, template.id));
    expect(positions.map((row) => row.position).sort()).toEqual([0, 1]);
  });

  it("removes every slot", async () => {
    const template = await createMealTemplate(db, {
      name: "Light Supper",
      hour: "21:00",
      mealTypeId: await seededMealTypeId("dinner"),
      slotCategoryIds: [await categoryId("Bites")],
    });

    await updateMealTemplate(db, template.id, {
      name: "Light Supper",
      hour: "21:00",
      mealTypeId: await seededMealTypeId("dinner"),
      slotCategoryIds: [],
    });

    expect((await getMealTemplate(db, template.id))?.slotCategoryIds).toEqual([]);
  });
});

describe("listMealTemplates", () => {
  it("gives each template its own slots, in order", async () => {
    const [soup, salad] = [await categoryId("Broths"), await categoryId("Greens")];
    const first = await createMealTemplate(db, {
      name: "Soup and Salad",
      hour: "12:00",
      mealTypeId: await seededMealTypeId("lunch"),
      slotCategoryIds: [soup, salad],
    });
    const second = await createMealTemplate(db, {
      name: "Salad First",
      hour: "12:15",
      mealTypeId: await seededMealTypeId("lunch"),
      slotCategoryIds: [salad, soup],
    });

    const listed = await listMealTemplates(db);
    expect(listed.find((template) => template.id === first.id)?.slotCategoryIds).toEqual([soup, salad]);
    expect(listed.find((template) => template.id === second.id)?.slotCategoryIds).toEqual([salad, soup]);
  });
});

describe("deleteMealTemplate", () => {
  it("hard deletes the template", async () => {
    const template = await createMealTemplate(db, {
      name: "Quick Breakfast",
      hour: "07:15",
      mealTypeId: await seededMealTypeId("breakfast"),
      slotCategoryIds: [],
    });

    await deleteMealTemplate(db, template.id);

    expect(await getMealTemplate(db, template.id)).toBeUndefined();
    expect((await listMealTemplates(db)).map((t) => t.id)).not.toContain(template.id);
  });

  it("takes the template's slots with it", async () => {
    const template = await createMealTemplate(db, {
      name: "Picnic",
      hour: "13:30",
      mealTypeId: await seededMealTypeId("lunch"),
      slotCategoryIds: [await categoryId("Finger Food"), await categoryId("Cold Drinks")],
    });

    await deleteMealTemplate(db, template.id);

    expect(await db.select().from(layoutSlots).where(eq(layoutSlots.templateId, template.id))).toEqual([]);
  });
});

describe("meal_templates.meal_type_id", () => {
  // ON DELETE RESTRICT, never CASCADE: removing a Meal Type must never take
  // its templates with it.
  it("blocks deleting a Meal Type that a template uses", async () => {
    const [brunch] = await db.insert(mealTypes).values({ name: "Brunch", priority: 2 }).returning();
    const template = await createMealTemplate(db, {
      name: "Sunday Brunch",
      hour: "11:00",
      mealTypeId: brunch!.id,
      slotCategoryIds: [],
    });

    await expect(db.delete(mealTypes).where(eq(mealTypes.id, brunch!.id))).rejects.toThrow();
    expect(await getMealTemplate(db, template.id)).toBeDefined();
  });
});

describe("layout_slots.slot_category_id", () => {
  // ON DELETE RESTRICT, never CASCADE: removing a Food Category a slot uses
  // Archives it, and the slot keeps it.
  it("makes removing a category a slot uses Archive it, kept by the slot", async () => {
    const category = await categoryId("Tapas");
    const template = await createMealTemplate(db, {
      name: "Tapas Night",
      hour: "20:30",
      mealTypeId: await seededMealTypeId("dinner"),
      slotCategoryIds: [category],
    });

    expect(await removeCategory(db, category)).toBe("archived");
    expect((await getCategory(db, category))?.archivedAt).not.toBeNull();
    expect((await getMealTemplate(db, template.id))?.slotCategoryIds).toEqual([category]);
  });
});

describe("listPickableSlotCategories", () => {
  it("offers the non-Archived categories, plus the Archived ones the given templates use", async () => {
    const [kept, archivedInUse, archivedElsewhere] = [
      await categoryId("Platters"),
      await categoryId("Fondue"),
      await categoryId("Raclette"),
    ];
    const lunchId = await seededMealTypeId("lunch");
    const mine = await createMealTemplate(db, {
      name: "Alpine Lunch",
      hour: "12:45",
      mealTypeId: lunchId,
      slotCategoryIds: [archivedInUse],
    });
    await createMealTemplate(db, {
      name: "Ski Lunch",
      hour: "13:15",
      mealTypeId: lunchId,
      slotCategoryIds: [archivedElsewhere],
    });
    await removeCategory(db, archivedInUse);
    await removeCategory(db, archivedElsewhere);

    const pickable = await listPickableSlotCategories(db, [mine.id]);

    const ids = pickable.map((category) => category.id);
    expect(ids).toEqual(expect.arrayContaining([kept, archivedInUse]));
    expect(ids).not.toContain(archivedElsewhere);
    expect(pickable.find((category) => category.id === archivedInUse)?.archived).toBe(true);
    expect(pickable.find((category) => category.id === kept)?.archived).toBe(false);
  });

  it("offers only the non-Archived categories for a new template", async () => {
    const archived = await categoryId("Leftover Night");
    await createMealTemplate(db, {
      name: "Fridge Clear-out",
      hour: "19:45",
      mealTypeId: await seededMealTypeId("dinner"),
      slotCategoryIds: [archived],
    });
    await removeCategory(db, archived);

    const pickable = await listPickableSlotCategories(db, []);

    expect(pickable.every((category) => !category.archived)).toBe(true);
    expect(pickable.map((category) => category.id)).not.toContain(archived);
  });
});
