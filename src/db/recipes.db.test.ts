import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { RecipeFields } from "@/core/recipes";
import { createRecipe, getRecipe, listActiveRecipes, updateRecipe } from "./recipes";
import { recipes } from "./schema";
import { createTestDb } from "./test-database";

let db: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  db = await createTestDb();
});

const lasagne: RecipeFields = {
  name: "Lasagne",
  portions: 4,
  steps: "1. Layer\n2. Bake",
  prepTimeMinutes: 90,
  sourceUrl: "https://example.com/lasagne",
};

describe("createRecipe", () => {
  it("adds a Recipe to the Recipes list", async () => {
    const recipe = await createRecipe(db, lasagne);

    expect(recipe).toEqual({ id: expect.any(String), ...lasagne });
    expect(await listActiveRecipes(db)).toContainEqual(recipe);
    expect(await getRecipe(db, recipe.id)).toEqual(recipe);
  });
});

describe("updateRecipe", () => {
  it("changes every field", async () => {
    const recipe = await createRecipe(db, { ...lasagne, name: "Toast" });
    const changes = { name: "Cheese Toast", portions: 2, steps: "Grill.", prepTimeMinutes: 10, sourceUrl: null };

    await updateRecipe(db, recipe.id, changes);

    expect(await getRecipe(db, recipe.id)).toEqual({ id: recipe.id, ...changes });
  });
});

describe("listActiveRecipes", () => {
  it("leaves out Archived Recipes", async () => {
    const recipe = await createRecipe(db, { ...lasagne, name: "Old Stew" });
    await db.update(recipes).set({ archivedAt: new Date() }).where(eq(recipes.id, recipe.id));

    expect((await listActiveRecipes(db)).map((r) => r.id)).not.toContain(recipe.id);
  });
});

describe("recipes table", () => {
  it.each([
    ["0 Portions", { portions: 0 }],
    ["a prep time of 0", { prepTimeMinutes: 0 }],
  ])("rejects %s", async (_, fields) => {
    await expect(db.insert(recipes).values({ ...lasagne, ...fields })).rejects.toThrow();
  });

  // The types already forbid it, so this goes around them.
  it("rejects a Recipe without a prep time", async () => {
    await expect(
      db.execute(sql`INSERT INTO recipes (name, portions, steps) VALUES ('Soup', 2, '')`),
    ).rejects.toThrow();
  });
});
