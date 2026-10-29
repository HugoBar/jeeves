import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Ingredient } from "@/core/ingredients";
import type { RecipeContent, RecipeFields } from "@/core/recipes";
import type { DefaultUnit } from "@/core/units";
import { createCategory, getCategory, listActiveCategories, removeCategory } from "./food-categories";
import { listActiveMealTypes } from "./meal-types";
import { addMealSlot, createMeal } from "./meals";
import { createProduct, getProduct, listActiveProducts, removeProduct, updateProduct } from "./products";
import {
  createRecipe,
  getRecipe,
  getRecipeFoodCategories,
  listActiveRecipes,
  listIngredientUses,
  listPickableProducts,
  listRecipeCategoryOverrides,
  listRecipeIngredients,
  removeRecipe,
  updateRecipe,
} from "./recipes";
import { foodCategories, ingredients, products, recipes } from "./schema";
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
async function aProduct(
  name: string,
  {
    defaultUnit = "g",
    density = null,
    categoryIds = [],
  }: { defaultUnit?: DefaultUnit; density?: number | null; categoryIds?: string[] } = {},
) {
  const result = await createProduct(db, { name, defaultUnit, density, packSize: null, categoryIds });
  if (!result.ok) throw new Error(`Could not create ${name}: ${result.error}`);
  return result.product;
}

// A Recipe's content: Lasagne's fields, with no Ingredients or overrides
// unless given.
function content(changes: Partial<RecipeContent> = {}): RecipeContent {
  return { ...lasagne, ingredients: [], categoryOverrides: [], ...changes };
}

async function unarchiveCategory(id: string) {
  await db.update(foodCategories).set({ archivedAt: null }).where(eq(foodCategories.id, id));
}

async function archiveProduct(id: string) {
  await db.update(products).set({ archivedAt: new Date() }).where(eq(products.id, id));
}

describe("createRecipe", () => {
  it("adds a Recipe to the Recipes list", async () => {
    const recipe = await createRecipe(db, content());

    expect(recipe).toEqual({ id: expect.any(String), ...lasagne });
    expect(await listActiveRecipes(db)).toContainEqual(recipe);
    expect(await getRecipe(db, recipe.id)).toEqual(recipe);
  });
});

describe("Ingredients on a Recipe", () => {
  it("saves a new Recipe's Ingredients and lists them in the order entered, with their Product names", async () => {
    const flour = await aProduct("Pasta Flour");
    const eggs = await aProduct("Pasta Eggs", { defaultUnit: "pc" });
    const added: Ingredient[] = [
      { productId: flour.id, amount: 300.5, unit: "g", minor: false },
      { productId: eggs.id, amount: 3, unit: "pc", minor: false },
      { productId: flour.id, amount: 1, unit: "tbsp", minor: true },
    ];

    const recipe = await createRecipe(db, content({ name: "Fresh Pasta", ingredients: added }));

    expect(await listRecipeIngredients(db, recipe.id)).toEqual([
      { ...added[0], productName: "Pasta Flour" },
      { ...added[1], productName: "Pasta Eggs" },
      { ...added[2], productName: "Pasta Flour" },
    ]);
  });

  it("replaces a Recipe's Ingredients with the ones saved when editing", async () => {
    const rice = await aProduct("Arborio");
    const stock = await aProduct("Veg Stock", { defaultUnit: "ml" });
    const recipe = await createRecipe(
      db,
      content({ name: "Risotto", ingredients: [{ productId: rice.id, amount: 200, unit: "g", minor: false }] }),
    );

    await updateRecipe(
      db,
      recipe.id,
      content({
        name: "Risotto",
        ingredients: [
          { productId: stock.id, amount: 1, unit: "l", minor: false },
          { productId: rice.id, amount: 250, unit: "g", minor: false },
        ],
      }),
    );

    expect(await listRecipeIngredients(db, recipe.id)).toEqual([
      { productId: stock.id, productName: "Veg Stock", amount: 1, unit: "l", minor: false },
      { productId: rice.id, productName: "Arborio", amount: 250, unit: "g", minor: false },
    ]);
  });

  it("removes every Ingredient when saved with none", async () => {
    const bread = await aProduct("Sourdough");
    const recipe = await createRecipe(
      db,
      content({ name: "Plain Toast", ingredients: [{ productId: bread.id, amount: 2, unit: "g", minor: false }] }),
    );

    await updateRecipe(db, recipe.id, content({ name: "Plain Toast" }));

    expect(await listRecipeIngredients(db, recipe.id)).toEqual([]);
  });
});

describe("getRecipeFoodCategories", () => {
  it("derives the non-Minor Ingredients' Products' Food Categories, each once, leaving out Archived ones", async () => {
    const meat = await createCategory(db, { name: "Mince", kind: "kind" });
    const main = await createCategory(db, { name: "Mains", kind: "role" });
    const herbs = await createCategory(db, { name: "Herbs", kind: "kind" });
    const retired = await createCategory(db, { name: "Retired", kind: "kind" });
    const beef = await aProduct("Ground Beef", { categoryIds: [meat.id, main.id, retired.id] });
    const sheets = await aProduct("Lasagne Sheets", { categoryIds: [main.id] });
    const basil = await aProduct("Basil", { categoryIds: [herbs.id] });
    // Beef still carries it, so it is only Archived.
    expect(await removeCategory(db, retired.id)).toBe("archived");

    const recipe = await createRecipe(
      db,
      content({
        name: "Beef Lasagne",
        ingredients: [
          { productId: beef.id, amount: 500, unit: "g", minor: false },
          { productId: sheets.id, amount: 250, unit: "g", minor: false },
          { productId: basil.id, amount: 5, unit: "g", minor: true },
        ],
      }),
    );

    const { derived } = await getRecipeFoodCategories(db, recipe.id);
    expect(derived.map((category) => category.id).sort()).toEqual([meat.id, main.id].sort());
  });

  it("follows changes to the Ingredients and to their Products' Food Categories", async () => {
    const fish = await createCategory(db, { name: "Oily Fish", kind: "kind" });
    const grains = await createCategory(db, { name: "Rice Grains", kind: "kind" });
    const salmon = await aProduct("Salmon Fillet", { categoryIds: [fish.id] });
    const rice = await aProduct("Sushi Rice");
    const recipe = await createRecipe(
      db,
      content({ name: "Salmon Bowl", ingredients: [{ productId: salmon.id, amount: 200, unit: "g", minor: false }] }),
    );
    const ids = async () => (await getRecipeFoodCategories(db, recipe.id)).derived.map((category) => category.id);
    expect(await ids()).toEqual([fish.id]);

    await updateRecipe(
      db,
      recipe.id,
      content({
        name: "Salmon Bowl",
        ingredients: [
          { productId: salmon.id, amount: 200, unit: "g", minor: true },
          { productId: rice.id, amount: 150, unit: "g", minor: false },
        ],
      }),
    );
    expect(await ids()).toEqual([]);

    await updateProduct(db, rice.id, { name: "Sushi Rice", density: null, packSize: null, categoryIds: [grains.id] });
    expect(await ids()).toEqual([grains.id]);
  });
});

describe("Food Category overrides on a Recipe", () => {
  const idsOf = (categories: { id: string }[]) => categories.map((category) => category.id).sort();

  it("adds and removes Food Categories in the final set, leaving the derived set as is", async () => {
    const pasta = await createCategory(db, { name: "Egg Pasta", kind: "kind" });
    const eggs = await createCategory(db, { name: "Hen Eggs", kind: "kind" });
    const main = await createCategory(db, { name: "Big Plate", kind: "role" });
    const tagliatelle = await aProduct("Tagliatelle", { categoryIds: [pasta.id, eggs.id] });

    const recipe = await createRecipe(
      db,
      content({
        name: "Tagliatelle al Ragu",
        ingredients: [{ productId: tagliatelle.id, amount: 300, unit: "g", minor: false }],
        categoryOverrides: [
          { categoryId: main.id, mode: "add" },
          { categoryId: eggs.id, mode: "remove" },
        ],
      }),
    );

    const { derived, final } = await getRecipeFoodCategories(db, recipe.id);
    expect(idsOf(derived)).toEqual([pasta.id, eggs.id].sort());
    expect(idsOf(final)).toEqual([pasta.id, main.id].sort());
  });

  it("survive Ingredient edits, applying to what the new Ingredients give", async () => {
    const dairy = await createCategory(db, { name: "Cow Dairy", kind: "kind" });
    const soup = await createCategory(db, { name: "Bowl Food", kind: "role" });
    const leek = await aProduct("Soup Leek");
    const cream = await aProduct("Soup Cream", { categoryIds: [dairy.id] });
    const overrides = [
      { categoryId: soup.id, mode: "add" as const },
      { categoryId: dairy.id, mode: "remove" as const },
    ];
    const recipe = await createRecipe(
      db,
      content({
        name: "Leek Soup",
        ingredients: [{ productId: leek.id, amount: 500, unit: "g", minor: false }],
        categoryOverrides: overrides,
      }),
    );

    await updateRecipe(
      db,
      recipe.id,
      content({
        name: "Leek Soup",
        ingredients: [
          { productId: leek.id, amount: 500, unit: "g", minor: false },
          { productId: cream.id, amount: 100, unit: "g", minor: false },
        ],
        categoryOverrides: overrides,
      }),
    );

    const { derived, final } = await getRecipeFoodCategories(db, recipe.id);
    expect(idsOf(derived)).toEqual([dairy.id]);
    expect(idsOf(final)).toEqual([soup.id]);
    expect(await listRecipeCategoryOverrides(db, recipe.id)).toEqual(expect.arrayContaining(overrides));
  });

  it("replaces the overrides with the ones saved when editing", async () => {
    const starter = await createCategory(db, { name: "First Course", kind: "role" });
    const side = await createCategory(db, { name: "On The Side", kind: "role" });
    const recipe = await createRecipe(
      db,
      content({ name: "Bruschetta", categoryOverrides: [{ categoryId: starter.id, mode: "add" }] }),
    );

    await updateRecipe(
      db,
      recipe.id,
      content({ name: "Bruschetta", categoryOverrides: [{ categoryId: side.id, mode: "add" }] }),
    );

    expect(await listRecipeCategoryOverrides(db, recipe.id)).toEqual([{ categoryId: side.id, mode: "add" }]);
  });

  it("ignores overrides on Archived categories but keeps them through a save", async () => {
    const dessert = await createCategory(db, { name: "Pudding", kind: "role" });
    const fruit = await createCategory(db, { name: "Orchard Fruit", kind: "kind" });
    const apple = await aProduct("Baking Apple", { categoryIds: [fruit.id] });
    const appleIngredients: Ingredient[] = [{ productId: apple.id, amount: 400, unit: "g", minor: false }];
    const recipe = await createRecipe(
      db,
      content({
        name: "Apple Crumble",
        ingredients: appleIngredients,
        categoryOverrides: [
          { categoryId: dessert.id, mode: "add" },
          { categoryId: fruit.id, mode: "remove" },
        ],
      }),
    );
    // The override and Baking Apple still carry them, so they are only Archived.
    expect(await removeCategory(db, dessert.id)).toBe("archived");
    expect(await removeCategory(db, fruit.id)).toBe("archived");

    expect(await getRecipeFoodCategories(db, recipe.id)).toEqual({ derived: [], final: [] });
    expect(await listRecipeCategoryOverrides(db, recipe.id)).toEqual([]);

    // Saving from the form, which no longer offers them, keeps their overrides.
    await updateRecipe(db, recipe.id, content({ name: "Apple Crumble", ingredients: appleIngredients }));
    await unarchiveCategory(dessert.id);
    expect(idsOf((await getRecipeFoodCategories(db, recipe.id)).final)).toEqual([dessert.id]);
  });

  // The form doesn't offer them, so only a crafted request could.
  it("doesn't save new overrides on Archived categories", async () => {
    const drink = await createCategory(db, { name: "Beverage", kind: "role" });
    await aProduct("Pressed Juice", { categoryIds: [drink.id] });
    expect(await removeCategory(db, drink.id)).toBe("archived");

    const recipe = await createRecipe(
      db,
      content({ name: "Lemonade", categoryOverrides: [{ categoryId: drink.id, mode: "add" }] }),
    );

    await unarchiveCategory(drink.id);
    expect(await listRecipeCategoryOverrides(db, recipe.id)).toEqual([]);
  });

  // Neither can come from the form, which lists each category once by its id.
  it("are saved once per category, skipping ids that are not a category's", async () => {
    const dessert = await createCategory(db, { name: "Sweet Course", kind: "role" });

    const recipe = await createRecipe(
      db,
      content({
        name: "Rice Pudding",
        categoryOverrides: [
          { categoryId: dessert.id, mode: "add" },
          { categoryId: dessert.id, mode: "remove" },
          { categoryId: "not-a-uuid", mode: "add" },
        ],
      }),
    );

    expect(await listRecipeCategoryOverrides(db, recipe.id)).toEqual([{ categoryId: dessert.id, mode: "add" }]);
  });

  it("Archive a Food Category they use instead of letting it be deleted", async () => {
    const snack = await createCategory(db, { name: "Nibbles", kind: "role" });
    await createRecipe(db, content({ name: "Popcorn", categoryOverrides: [{ categoryId: snack.id, mode: "add" }] }));

    expect(await removeCategory(db, snack.id)).toBe("archived");
    expect(await getCategory(db, snack.id)).toMatchObject({ archivedAt: expect.any(Date) });
  });
});

describe("listPickableProducts", () => {
  it("offers non-Archived Products, by name, with what converting needs", async () => {
    const product = await aProduct("Picked Oil", { defaultUnit: "ml", density: 0.92 });
    const archived = await aProduct("Gone Oil", { defaultUnit: "ml" });
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
    const recipe = await createRecipe(
      db,
      content({ name: "Paella", ingredients: [{ productId: saffron.id, amount: 0.5, unit: "g", minor: true }] }),
    );
    await archiveProduct(saffron.id);

    expect(await listPickableProducts(db, recipe.id)).toContainEqual(
      expect.objectContaining({ id: saffron.id, archived: true }),
    );
    expect((await listPickableProducts(db)).map((p) => p.id)).not.toContain(saffron.id);
  });
});

describe("updateRecipe", () => {
  it("changes every field", async () => {
    const recipe = await createRecipe(db, content({ name: "Toast" }));
    const changes = { name: "Cheese Toast", portions: 2, steps: "Grill.", prepTimeMinutes: 10, sourceUrl: null };

    await updateRecipe(db, recipe.id, content(changes));

    expect(await getRecipe(db, recipe.id)).toEqual({ id: recipe.id, ...changes });
  });
});

describe("listActiveRecipes", () => {
  it("leaves out Archived Recipes", async () => {
    const recipe = await createRecipe(db, content({ name: "Old Stew" }));
    await db.update(recipes).set({ archivedAt: new Date() }).where(eq(recipes.id, recipe.id));

    expect((await listActiveRecipes(db)).map((r) => r.id)).not.toContain(recipe.id);
  });
});

describe("removeRecipe", () => {
  it("deletes a Recipe nothing refers to", async () => {
    const recipe = await createRecipe(db, content({ name: "Gazpacho" }));

    expect(await removeRecipe(db, recipe.id)).toBe("deleted");
    expect(await getRecipe(db, recipe.id)).toBeUndefined();
  });

  // Nothing refers to a Recipe until Meal Slots, so a stand-in table does.
  it("archives a Recipe something refers to, keeping it but leaving the Recipes list", async () => {
    const recipe = await createRecipe(db, content({ name: "Chili" }));
    await db.execute(sql`CREATE TABLE recipe_references (recipe_id uuid NOT NULL REFERENCES recipes (id))`);
    await db.execute(sql`INSERT INTO recipe_references VALUES (${recipe.id})`);

    expect(await removeRecipe(db, recipe.id)).toBe("archived");
    expect((await listActiveRecipes(db)).map((r) => r.id)).not.toContain(recipe.id);
    expect(await getRecipe(db, recipe.id)).toEqual(recipe);
    await db.execute(sql`DROP TABLE recipe_references`);
  });

  it("deletes a Recipe with Food Category overrides, and its overrides with it", async () => {
    const salad = await createCategory(db, { name: "Leafy Plate", kind: "role" });
    const recipe = await createRecipe(
      db,
      content({ name: "Green Salad", categoryOverrides: [{ categoryId: salad.id, mode: "add" }] }),
    );

    expect(await removeRecipe(db, recipe.id)).toBe("deleted");
    expect(await listRecipeCategoryOverrides(db, recipe.id)).toEqual([]);
    // Nothing refers to the category any more, so it is not Archived either.
    expect(await removeCategory(db, salad.id)).toBe("deleted");
  });

  it("deletes a Recipe with Ingredients, and its Ingredients with it", async () => {
    const beans = await aProduct("Black Beans");
    const recipe = await createRecipe(
      db,
      content({ name: "Bean Stew", ingredients: [{ productId: beans.id, amount: 400, unit: "g", minor: false }] }),
    );

    expect(await removeRecipe(db, recipe.id)).toBe("deleted");
    expect(await listRecipeIngredients(db, recipe.id)).toEqual([]);
    // Nothing refers to the Product any more, so it is not Archived either.
    expect(await removeProduct(db, beans.id)).toBe("deleted");
  });
});

describe("removing a Product used by an Ingredient", () => {
  it("Archives the Product instead, and the Ingredient keeps it", async () => {
    const leeks = await aProduct("Leeks", { defaultUnit: "pc" });
    const recipe = await createRecipe(
      db,
      content({ name: "Leek Soup", ingredients: [{ productId: leeks.id, amount: 2, unit: "pc", minor: false }] }),
    );

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
  // exception: they go with it.
  it("is only referenced by foreign keys that block deletion, besides its own Ingredients and overrides", async () => {
    const cascading = await db.execute(sql`
      SELECT conrelid::regclass::text AS referencing_table FROM pg_constraint
      WHERE contype = 'f' AND confrelid = 'recipes'::regclass AND confdeltype NOT IN ('a', 'r')`);

    expect(cascading.rows.map((row) => row.referencing_table).sort()).toEqual([
      "ingredients",
      "recipe_category_overrides",
    ]);
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
    const recipe = await createRecipe(db, content({ name: "Empty Plate" }));
    const product = await aProduct("Air");

    await expect(
      db.insert(ingredients).values({ recipeId: recipe.id, productId: product.id, amount: 0, unit: "g", position: 0 }),
    ).rejects.toThrow();
  });
});

describe("listIngredientUses", () => {
  // Flour in g with a Density, written in several units by several Recipes.
  it("lists the Ingredients using a Product in Recipes that can still be cooked, by Recipe name", async () => {
    const flour = await aProduct("Density Flour", { density: 0.53 });
    const egg = await aProduct("Density Egg", { defaultUnit: "pc" });
    const recipe = (name: string, flourIngredients: Ingredient[]) =>
      createRecipe(db, {
        ...lasagne,
        name,
        ingredients: [{ productId: egg.id, amount: 2, unit: "pc", minor: false }, ...flourIngredients],
        categoryOverrides: [],
      });
    const flourIn = (amount: number, unit: Ingredient["unit"]): Ingredient => ({
      productId: flour.id,
      amount,
      unit,
      minor: false,
    });

    await recipe("Pancakes", [flourIn(1, "cup")]);
    await recipe("Bread", [flourIn(500, "g"), flourIn(2, "tbsp")]);
    // Archived, but a Meal not yet Confirmed or Skipped still uses it.
    const plannedCake = await recipe("Planned Cake", [flourIn(2, "cup")]);
    const lunch = (await listActiveMealTypes(db)).find((mealType) => mealType.seedKey === "lunch")!;
    const meal = await createMeal(db, { date: "2026-11-10", hour: "12:00", name: null, mealTypeId: lunch.id });
    await addMealSlot(db, meal.id, {
      slotCategoryId: (await listActiveCategories(db))[0]!.id,
      fill: { content: "recipe", recipeId: plannedCake.id, portions: 4 },
    });
    await removeRecipe(db, plannedCake.id);
    // Archived, and only in a Meal whose day has passed: Unconfirmed, so it can
    // still be Confirmed.
    const unconfirmedPie = await recipe("Unconfirmed Pie", [flourIn(1, "tbsp")]);
    const pastMeal = await createMeal(db, { date: "2026-09-01", hour: "12:00", name: null, mealTypeId: lunch.id });
    await addMealSlot(db, pastMeal.id, {
      slotCategoryId: (await listActiveCategories(db))[0]!.id,
      fill: { content: "recipe", recipeId: unconfirmedPie.id, portions: 4 },
    });
    await removeRecipe(db, unconfirmedPie.id);
    // Archived and used by no Meal: it can never be cooked again.
    const oldCake = await recipe("Old Cake", [flourIn(3, "cup")]);
    await db.update(recipes).set({ archivedAt: new Date() }).where(eq(recipes.id, oldCake.id));

    expect(await listIngredientUses(db, flour.id)).toEqual([
      { recipeName: "Bread", amount: 500, unit: "g" },
      { recipeName: "Bread", amount: 2, unit: "tbsp" },
      { recipeName: "Pancakes", amount: 1, unit: "cup" },
      { recipeName: "Planned Cake", amount: 2, unit: "cup" },
      { recipeName: "Unconfirmed Pie", amount: 1, unit: "tbsp" },
    ]);
  });

  it("lists nothing for a Product no Recipe uses", async () => {
    const salt = await aProduct("Density Salt");
    expect(await listIngredientUses(db, salt.id)).toEqual([]);
  });
});
