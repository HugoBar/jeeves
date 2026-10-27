import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Ingredient } from "@/core/ingredients";
import type { RecipeFields } from "@/core/recipes";
import type { DefaultUnit } from "@/core/units";
import { createProduct, getProduct, listActiveProducts, removeProduct } from "./products";
import {
  createRecipe,
  getRecipe,
  listActiveRecipes,
  listPickableProducts,
  listRecipeIngredients,
  removeRecipe,
  updateRecipe,
} from "./recipes";
import { ingredients, products, recipes } from "./schema";
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

// A plain Product under a name no other test uses.
async function aProduct(name: string, defaultUnit: DefaultUnit = "g", density: number | null = null) {
  const result = await createProduct(db, { name, defaultUnit, density, packSize: null, categoryIds: [] });
  if (!result.ok) throw new Error(`Could not create ${name}: ${result.error}`);
  return result.product;
}

async function archiveProduct(id: string) {
  await db.update(products).set({ archivedAt: new Date() }).where(eq(products.id, id));
}

describe("createRecipe", () => {
  it("adds a Recipe to the Recipes list", async () => {
    const recipe = await createRecipe(db, lasagne, []);

    expect(recipe).toEqual({ id: expect.any(String), ...lasagne });
    expect(await listActiveRecipes(db)).toContainEqual(recipe);
    expect(await getRecipe(db, recipe.id)).toEqual(recipe);
  });
});

describe("Ingredients on a Recipe", () => {
  it("saves a new Recipe's Ingredients and lists them in the order entered, with their Product names", async () => {
    const flour = await aProduct("Pasta Flour");
    const eggs = await aProduct("Pasta Eggs", "pc");
    const added: Ingredient[] = [
      { productId: flour.id, amount: 300.5, unit: "g", minor: false },
      { productId: eggs.id, amount: 3, unit: "pc", minor: false },
      { productId: flour.id, amount: 1, unit: "tbsp", minor: true },
    ];

    const recipe = await createRecipe(db, { ...lasagne, name: "Fresh Pasta" }, added);

    expect(await listRecipeIngredients(db, recipe.id)).toEqual([
      { ...added[0], productName: "Pasta Flour" },
      { ...added[1], productName: "Pasta Eggs" },
      { ...added[2], productName: "Pasta Flour" },
    ]);
  });

  it("replaces a Recipe's Ingredients with the ones saved when editing", async () => {
    const rice = await aProduct("Arborio");
    const stock = await aProduct("Veg Stock", "ml");
    const recipe = await createRecipe(db, { ...lasagne, name: "Risotto" }, [
      { productId: rice.id, amount: 200, unit: "g", minor: false },
    ]);

    await updateRecipe(db, recipe.id, { ...lasagne, name: "Risotto" }, [
      { productId: stock.id, amount: 1, unit: "l", minor: false },
      { productId: rice.id, amount: 250, unit: "g", minor: false },
    ]);

    expect(await listRecipeIngredients(db, recipe.id)).toEqual([
      { productId: stock.id, productName: "Veg Stock", amount: 1, unit: "l", minor: false },
      { productId: rice.id, productName: "Arborio", amount: 250, unit: "g", minor: false },
    ]);
  });

  it("removes every Ingredient when saved with none", async () => {
    const bread = await aProduct("Sourdough");
    const recipe = await createRecipe(db, { ...lasagne, name: "Plain Toast" }, [
      { productId: bread.id, amount: 2, unit: "g", minor: false },
    ]);

    await updateRecipe(db, recipe.id, { ...lasagne, name: "Plain Toast" }, []);

    expect(await listRecipeIngredients(db, recipe.id)).toEqual([]);
  });
});

describe("listPickableProducts", () => {
  it("offers non-Archived Products, by name, with what converting needs", async () => {
    const product = await aProduct("Picked Oil", "ml", 0.92);
    const archived = await aProduct("Gone Oil", "ml");
    await archiveProduct(archived.id);

    const pickable = await listPickableProducts(db);

    expect(pickable).toContainEqual({ id: product.id, name: "Picked Oil", defaultUnit: "ml", density: 0.92, archived: false });
    expect(pickable.map((p) => p.id)).not.toContain(archived.id);
    const names = pickable.map((p) => p.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  // So editing a Recipe never silently swaps out an Ingredient whose Product
  // was Archived since.
  it("also offers the Archived Products a Recipe already uses", async () => {
    const saffron = await aProduct("Saffron");
    const recipe = await createRecipe(db, { ...lasagne, name: "Paella" }, [
      { productId: saffron.id, amount: 0.5, unit: "g", minor: true },
    ]);
    await archiveProduct(saffron.id);

    expect(await listPickableProducts(db, recipe.id)).toContainEqual(
      expect.objectContaining({ id: saffron.id, archived: true }),
    );
    expect((await listPickableProducts(db)).map((p) => p.id)).not.toContain(saffron.id);
  });
});

describe("updateRecipe", () => {
  it("changes every field", async () => {
    const recipe = await createRecipe(db, { ...lasagne, name: "Toast" }, []);
    const changes = { name: "Cheese Toast", portions: 2, steps: "Grill.", prepTimeMinutes: 10, sourceUrl: null };

    await updateRecipe(db, recipe.id, changes, []);

    expect(await getRecipe(db, recipe.id)).toEqual({ id: recipe.id, ...changes });
  });
});

describe("listActiveRecipes", () => {
  it("leaves out Archived Recipes", async () => {
    const recipe = await createRecipe(db, { ...lasagne, name: "Old Stew" }, []);
    await db.update(recipes).set({ archivedAt: new Date() }).where(eq(recipes.id, recipe.id));

    expect((await listActiveRecipes(db)).map((r) => r.id)).not.toContain(recipe.id);
  });
});

describe("removeRecipe", () => {
  it("deletes a Recipe nothing refers to", async () => {
    const recipe = await createRecipe(db, { ...lasagne, name: "Gazpacho" }, []);

    expect(await removeRecipe(db, recipe.id)).toBe("deleted");
    expect(await getRecipe(db, recipe.id)).toBeUndefined();
  });

  // Nothing refers to a Recipe until Meal Slots, so a stand-in table does.
  it("archives a Recipe something refers to, keeping it but leaving the Recipes list", async () => {
    const recipe = await createRecipe(db, { ...lasagne, name: "Chili" }, []);
    await db.execute(sql`CREATE TABLE recipe_references (recipe_id uuid NOT NULL REFERENCES recipes (id))`);
    await db.execute(sql`INSERT INTO recipe_references VALUES (${recipe.id})`);

    expect(await removeRecipe(db, recipe.id)).toBe("archived");
    expect((await listActiveRecipes(db)).map((r) => r.id)).not.toContain(recipe.id);
    expect(await getRecipe(db, recipe.id)).toEqual(recipe);
    await db.execute(sql`DROP TABLE recipe_references`);
  });

  it("deletes a Recipe with Ingredients, and its Ingredients with it", async () => {
    const beans = await aProduct("Black Beans");
    const recipe = await createRecipe(db, { ...lasagne, name: "Bean Stew" }, [
      { productId: beans.id, amount: 400, unit: "g", minor: false },
    ]);

    expect(await removeRecipe(db, recipe.id)).toBe("deleted");
    expect(await listRecipeIngredients(db, recipe.id)).toEqual([]);
    // Nothing refers to the Product any more, so it is not Archived either.
    expect(await removeProduct(db, beans.id)).toBe("deleted");
  });
});

describe("removing a Product used by an Ingredient", () => {
  it("Archives the Product instead, and the Ingredient keeps it", async () => {
    const leeks = await aProduct("Leeks", "pc");
    const recipe = await createRecipe(db, { ...lasagne, name: "Leek Soup" }, [
      { productId: leeks.id, amount: 2, unit: "pc", minor: false },
    ]);

    expect(await removeProduct(db, leeks.id)).toBe("archived");
    expect((await listActiveProducts(db)).map((p) => p.id)).not.toContain(leeks.id);
    expect(await getProduct(db, leeks.id)).toBeDefined();
    expect(await listRecipeIngredients(db, recipe.id)).toEqual([
      { productId: leeks.id, productName: "Leeks", amount: 2, unit: "pc", minor: false },
    ]);
  });
});

describe("recipes table", () => {
  // A cascading reference would silently drop what refers to a Recipe instead
  // of Archiving it. Its own Ingredients and Food Category overrides are the
  // exception: they go with it, and overrides join this list when they land.
  it("is only referenced by foreign keys that block deletion, besides its own Ingredients and overrides", async () => {
    const cascading = await db.execute(sql`
      SELECT conrelid::regclass::text AS referencing_table FROM pg_constraint
      WHERE contype = 'f' AND confrelid = 'recipes'::regclass AND confdeltype NOT IN ('a', 'r')`);

    expect(cascading.rows).toEqual([{ referencing_table: "ingredients" }]);
  });

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

describe("ingredients table", () => {
  it("rejects an amount of 0", async () => {
    const recipe = await createRecipe(db, { ...lasagne, name: "Empty Plate" }, []);
    const product = await aProduct("Air");

    await expect(
      db.insert(ingredients).values({ recipeId: recipe.id, productId: product.id, amount: 0, unit: "g", position: 0 }),
    ).rejects.toThrow();
  });
});
