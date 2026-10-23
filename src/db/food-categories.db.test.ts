import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { SEED_CATEGORIES } from "@/core/food-categories";
import { createCategory, listActiveCategories, removeCategory } from "./food-categories";
import { createProduct } from "./products";
import { createTestDb } from "./test-database";

let db: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  db = await createTestDb();
});

describe("removeCategory", () => {
  it("deletes a category nothing refers to", async () => {
    const category = await createCategory(db, { name: "Sauces", kind: "kind" });

    expect(await removeCategory(db, category.id)).toBe("deleted");
    expect((await listActiveCategories(db)).map((c) => c.id)).not.toContain(category.id);
  });

  it("archives a category a Product carries, so it leaves pickers", async () => {
    const category = await createCategory(db, { name: "Brunch", kind: "role" });
    await createProduct(db, {
      name: "Pancake Mix",
      defaultUnit: "g",
      density: null,
      packSize: null,
      categoryIds: [category.id],
    });

    expect(await removeCategory(db, category.id)).toBe("archived");
    expect((await listActiveCategories(db)).map((c) => c.id)).not.toContain(category.id);
  });
});

describe("food_categories table", () => {
  it("is seeded with exactly the categories core knows", async () => {
    const seeded = await db.execute<{ seed_key: string; kind: string }>(
      sql`SELECT seed_key, kind FROM food_categories WHERE seed_key IS NOT NULL`,
    );
    const byKey = (a: { seedKey: string }, b: { seedKey: string }) => a.seedKey.localeCompare(b.seedKey);

    expect(seeded.rows.map((row) => ({ seedKey: row.seed_key, kind: row.kind })).sort(byKey)).toEqual(
      [...SEED_CATEGORIES].sort(byKey),
    );
  });

  // A cascading reference would silently drop links instead of Archiving.
  it("is only referenced by foreign keys that block deletion", async () => {
    const cascading = await db.execute(sql`
      SELECT conrelid::regclass::text AS referencing_table FROM pg_constraint
      WHERE contype = 'f' AND confrelid = 'food_categories'::regclass AND confdeltype NOT IN ('a', 'r')`);

    expect(cascading.rows).toEqual([]);
  });
});
