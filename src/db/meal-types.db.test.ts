import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { SEED_MEAL_TYPES, type MealTypeSeedKey } from "@/core/meal-types";
import { createMealTemplate, getMealTemplate } from "./meal-templates";
import {
  createMealType,
  getMealType,
  listActiveMealTypes,
  removeMealType,
  updateMealType,
} from "./meal-types";
import { mealTypes } from "./schema";
import { createTestDb } from "./test-database";

let db: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  db = await createTestDb();
});

// First, before any test edits a seeded Meal Type.
describe("meal_types table", () => {
  it("is seeded with exactly the Meal Types core knows, unnamed", async () => {
    const seeded = await db.execute<{
      seed_key: string;
      name: string | null;
      priority: number;
      allows_leftovers: boolean;
    }>(sql`SELECT seed_key, name, priority, allows_leftovers FROM meal_types WHERE seed_key IS NOT NULL`);
    const byKey = (a: { seedKey: string }, b: { seedKey: string }) => a.seedKey.localeCompare(b.seedKey);

    expect(
      seeded.rows
        .map((row) => ({
          seedKey: row.seed_key,
          name: row.name,
          priority: row.priority,
          allowsLeftovers: row.allows_leftovers,
        }))
        .sort(byKey),
    ).toEqual(SEED_MEAL_TYPES.map((seed) => ({ ...seed, name: null })).sort(byKey));
  });

  it("rejects a Meal Priority of 0", async () => {
    await expect(db.insert(mealTypes).values({ name: "Midnight Feast", priority: 0 })).rejects.toThrow();
  });

  it("rejects a Meal Type with neither a seed key nor a name", async () => {
    await expect(db.insert(mealTypes).values({ priority: 1 })).rejects.toThrow();
  });

  // A cascading reference would silently drop templates instead of Archiving.
  it("is only referenced by foreign keys that block deletion", async () => {
    const cascading = await db.execute(sql`
      SELECT conrelid::regclass::text AS referencing_table FROM pg_constraint
      WHERE contype = 'f' AND confrelid = 'meal_types'::regclass AND confdeltype NOT IN ('a', 'r')`);

    expect(cascading.rows).toEqual([]);
  });
});

async function seeded(seedKey: MealTypeSeedKey) {
  const mealType = (await listActiveMealTypes(db)).find((m) => m.seedKey === seedKey);
  if (!mealType) throw new Error(`No seeded ${seedKey}`);
  return mealType;
}

describe("updateMealType", () => {
  it("changes a Meal Type's name, Meal Priority and Leftovers flag, keeping a seeded one's key", async () => {
    const snack = await seeded("snack");

    await updateMealType(db, snack.id, { name: "Afternoon Bite", priority: 2, allowsLeftovers: true });

    expect(await getMealType(db, snack.id)).toMatchObject({
      seedKey: "snack",
      name: "Afternoon Bite",
      priority: 2,
      allowsLeftovers: true,
    });
  });

  // An untouched name is no rename, so the Meal Type keeps following its key's string.
  it("can leave a seeded Meal Type's name unset", async () => {
    const breakfast = await seeded("breakfast");

    await updateMealType(db, breakfast.id, { name: null, priority: 3, allowsLeftovers: false });

    expect(await getMealType(db, breakfast.id)).toMatchObject({ seedKey: "breakfast", name: null, priority: 3 });
  });
});

describe("createMealType", () => {
  it("saves a name, Meal Priority and Leftovers flag, with no seed key", async () => {
    const created = await createMealType(db, { name: "Supper", priority: 4, allowsLeftovers: true });

    expect(await getMealType(db, created.id)).toMatchObject({
      seedKey: null,
      name: "Supper",
      priority: 4,
      allowsLeftovers: true,
    });
  });
});

describe("removeMealType", () => {
  it("deletes a Meal Type nothing refers to", async () => {
    const mealType = await createMealType(db, { name: "Elevenses", priority: 3, allowsLeftovers: false });

    expect(await removeMealType(db, mealType.id)).toBe("deleted");
    expect(await getMealType(db, mealType.id)).toBeUndefined();
  });

  it("archives a Meal Type a Meal Template uses, so it leaves the list and the template keeps it", async () => {
    const mealType = await createMealType(db, { name: "Brunch", priority: 2, allowsLeftovers: false });
    const template = await createMealTemplate(db, {
      name: "Sunday Brunch",
      hour: "11:00",
      mealTypeId: mealType.id,
      slotCategoryIds: [],
    });

    expect(await removeMealType(db, mealType.id)).toBe("archived");
    expect((await listActiveMealTypes(db)).map((m) => m.id)).not.toContain(mealType.id);
    expect(await getMealTemplate(db, template.id)).toMatchObject({ mealTypeId: mealType.id });
  });

  it("removes a seeded Meal Type like any other", async () => {
    const snack = await seeded("snack");

    expect(await removeMealType(db, snack.id)).toBe("deleted");
    expect(await getMealType(db, snack.id)).toBeUndefined();
  });
});
