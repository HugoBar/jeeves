import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createProduct } from "./products";
import { foodCategories, mealTypes, products } from "./schema";
import { createTestDb, resetTestDb, type TestDb } from "./test-database";

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});

async function aProduct(name: string) {
  const result = await createProduct(db, { name, defaultUnit: "g", density: null, packSize: null, categoryIds: [] });
  if (!result.ok) throw new Error(result.error);
}

describe("resetTestDb", () => {
  it("removes the rows a test added", async () => {
    await aProduct("Leftover");

    await resetTestDb(db);

    expect(await db.select().from(products)).toEqual([]);
  });

  it("puts back the seeded rows as the migrations left them", async () => {
    const seededTypes = await db.select().from(mealTypes);
    const seededCategories = await db.select().from(foodCategories);
    await db.update(mealTypes).set({ name: "Renamed", priority: 9 }).where(eq(mealTypes.id, seededTypes[0]!.id));
    await db.delete(foodCategories).where(eq(foodCategories.id, seededCategories[0]!.id));

    await resetTestDb(db);

    const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
    expect((await db.select().from(mealTypes)).sort(byId)).toEqual(seededTypes.sort(byId));
    expect((await db.select().from(foodCategories)).sort(byId)).toEqual(seededCategories.sort(byId));
  });
});

// Kept in order, so the second test runs after the first left a row.
describe("each test", { shuffle: false }, () => {
  it("can leave a row behind", async () => {
    await aProduct("Left behind");
  });

  it("starts without the rows an earlier test left", async () => {
    expect(await db.select().from(products)).toEqual([]);
  });
});
