import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { SEED_MEAL_TYPES, type MealTypeSeedKey } from "@/core/meal-types";
import { getMealType, listMealTypes, updateMealType } from "./meal-types";
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
});

describe("updateMealType", () => {
  async function seeded(seedKey: MealTypeSeedKey) {
    const mealType = (await listMealTypes(db)).find((m) => m.seedKey === seedKey);
    if (!mealType) throw new Error(`No seeded ${seedKey}`);
    return mealType;
  }

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
