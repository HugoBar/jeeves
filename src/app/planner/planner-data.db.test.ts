import { beforeAll, describe, expect, it } from "vitest";
import type { CategorySeedKey } from "@/core/food-categories";
import type { MealTypeSeedKey } from "@/core/meal-types";
import { confirmMeal } from "@/db/confirmation";
import { createCategory, listActiveCategories, removeCategory } from "@/db/food-categories";
import { createMealTemplate } from "@/db/meal-templates";
import { createMealType, listActiveMealTypes, removeMealType } from "@/db/meal-types";
import { createMeal, listMeals } from "@/db/meals";
import { createProduct } from "@/db/products";
import { createRecipe } from "@/db/recipes";
import { restockProduct } from "@/db/stock-movements";
import { createTestDb, type TestDb } from "@/db/test-database";
import { loadPickers, toPlannerMeals } from "./planner-data";

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});

// A Thursday; the planner then runs to Sunday 22 November.
const TODAY = "2026-11-12";
const LAST_DAY = "2026-11-22";

async function seededMealTypeId(seedKey: MealTypeSeedKey): Promise<string> {
  return (await listActiveMealTypes(db)).find((mealType) => mealType.seedKey === seedKey)!.id;
}

async function seededCategoryId(seedKey: CategorySeedKey): Promise<string> {
  return (await listActiveCategories(db)).find((category) => category.seedKey === seedKey)!.id;
}

async function product(name: string, stock = 0): Promise<string> {
  const result = await createProduct(db, {
    name,
    defaultUnit: "g",
    density: null,
    packSize: null,
    categoryIds: [await seededCategoryId("grains")],
  });
  if (!result.ok) throw new Error(result.error);
  if (stock > 0) await restockProduct(db, result.product.id, stock);
  return result.product.id;
}

// A lunch on `date` with one slot of `quantity` g of `productId`.
async function lunchOf(productId: string, quantity: number, { date = TODAY, untracked = false } = {}) {
  return createMeal(
    db,
    { date, hour: "13:00", name: `Lunch ${date}`, mealTypeId: await seededMealTypeId("lunch"), untracked },
    [{ slotCategoryId: await seededCategoryId("grains"), fill: { content: "product", productId, quantity } }],
  );
}

// The Meals of the planner's two weeks, from TODAY's Monday, as the cards show them.
async function plannerMeals() {
  return toPlannerMeals(db, await listMeals(db, "2026-11-09", LAST_DAY), LAST_DAY);
}

describe("loadPickers", () => {
  it("lists Meal Types by the hour their Meals usually are, added ones with no Meals last", async () => {
    await createMealType(db, { name: "Brunch", priority: 2, allowsLeftovers: false });
    // Snacks eaten at 07:00 come before Breakfast's usual 08:00.
    await createMeal(db, { date: TODAY, hour: "07:00", name: null, mealTypeId: await seededMealTypeId("snack") });

    const { mealTypes } = await loadPickers(db);

    expect(mealTypes.map((mealType) => mealType.label)).toEqual(["Snack", "Breakfast", "Lunch", "Dinner", "Brunch"]);
  });

  it("lists Slot Categories Roles first, then Kinds, each by name, and Products by name", async () => {
    for (const [name, kind] of [["Zz Kind", "kind"], ["Zz Role", "role"], ["Aa Kind", "kind"], ["Aa Role", "role"]] as const) {
      await createCategory(db, { name, kind });
    }
    for (const name of ["Cherry", "apple", "Banana"]) await product(name);

    const { slotCategories, slotFoods } = await loadPickers(db);

    const added = slotCategories.map((category) => category.label).filter((label) => /^(Aa|Zz) /.test(label));
    expect(added).toEqual(["Aa Role", "Zz Role", "Aa Kind", "Zz Kind"]);
    expect(slotFoods.products.map((food) => food.label)).toEqual(["apple", "Banana", "Cherry"]);
  });

  it("lists Meal Templates by their Meal Type's place in its picker, then by hour, Archived Meal Types last", async () => {
    const [breakfast, dinner] = [await seededMealTypeId("breakfast"), await seededMealTypeId("dinner")];
    const old = await createMealType(db, { name: "Old type", priority: 2, allowsLeftovers: false });
    await createMealTemplate(db, { name: "Old", hour: "06:00", mealTypeId: old.id, slotCategoryIds: [] });
    // Its Meals at 06:00 would put it first, were it not Archived.
    await createMeal(db, { date: TODAY, hour: "06:00", name: null, mealTypeId: old.id });
    await createMealTemplate(db, { name: "Supper", hour: "19:00", mealTypeId: dinner, slotCategoryIds: [] });
    await createMealTemplate(db, { name: "Late breakfast", hour: "10:00", mealTypeId: breakfast, slotCategoryIds: [] });
    await createMealTemplate(db, { name: "Early breakfast", hour: "07:00", mealTypeId: breakfast, slotCategoryIds: [] });
    // In use by its template, so Remove Archives it.
    await removeMealType(db, old.id);

    const { templates } = await loadPickers(db);

    expect(templates.map((template) => template.label)).toEqual(["Early breakfast", "Late breakfast", "Supper", "Old"]);
  });

  it("keeps an Archived Slot Category a Meal Template still uses, once, out of the slot picker", async () => {
    const old = await createCategory(db, { name: "Old Role", kind: "role" });
    const lunch = await seededMealTypeId("lunch");
    const grains = await seededCategoryId("grains");
    await createMealTemplate(db, { name: "Two old slots", hour: "13:00", mealTypeId: lunch, slotCategoryIds: [old.id, grains, old.id] });
    await createMealTemplate(db, { name: "One old slot", hour: "12:00", mealTypeId: lunch, slotCategoryIds: [old.id] });
    // In use by the templates, so Remove Archives it.
    await removeCategory(db, old.id);

    const { archivedSlotCategories, slotCategories, templates } = await loadPickers(db);

    expect(archivedSlotCategories).toEqual([{ id: old.id, label: "Old Role" }]);
    expect(slotCategories.map((category) => category.id)).not.toContain(old.id);
    expect(templates.find((template) => template.label === "One old slot")!.slots).toEqual([
      { slotCategoryId: old.id, label: "Old Role", archived: true },
    ]);
  });
});

describe("toPlannerMeals", () => {
  it("names each Product a slot is short of", async () => {
    const oats = await product("Oats", 50);
    await lunchOf(oats, 80);

    const [meal] = await plannerMeals();

    expect(meal!.slots[0]!.warnings).toEqual({
      shortfalls: [{ name: "Oats", amount: 30, defaultUnit: "g" }],
      unprojectable: [],
    });
  });

  it("names each Product a slot's Recipe uses in a unit its Stock can't be counted in", async () => {
    const oats = await product("Oats");
    // Kept in grams with no Density, so a spoonful can't be counted against it.
    const honey = await product("Honey", 500);
    const recipe = await createRecipe(db, {
      name: "Porridge",
      portions: 1,
      steps: "Stir",
      prepTimeMinutes: 5,
      sourceUrl: null,
      ingredients: [
        { productId: oats, amount: 40, unit: "g", minor: false },
        { productId: honey, amount: 1, unit: "tbsp", minor: false },
      ],
      categoryOverrides: [],
    });
    await createMeal(
      db,
      { date: TODAY, hour: "08:00", name: null, mealTypeId: await seededMealTypeId("breakfast") },
      [{ slotCategoryId: await seededCategoryId("grains"), fill: { content: "recipe", recipeId: recipe.id, portions: 2 } }],
    );

    const [meal] = await plannerMeals();

    expect(meal!.slots[0]!.warnings).toEqual({
      shortfalls: [{ name: "Oats", amount: 80, defaultUnit: "g" }],
      unprojectable: ["Honey"],
    });
  });

  it("gives a slot Stock covers no warnings", async () => {
    await lunchOf(await product("Oats", 100), 80);

    const [meal] = await plannerMeals();

    expect(meal!.slots[0]!.warnings).toBeNull();
  });

  it("says what Confirm takes only for a tracked Planned Meal", async () => {
    const oats = await product("Oats", 50);
    const tracked = await lunchOf(oats, 80);
    const untracked = await lunchOf(oats, 20, { date: "2026-11-13", untracked: true });

    const meals = await plannerMeals();
    const takes = (id: string) => meals.find((meal) => meal.id === id)!.takes;

    // Stock is short, so it takes what there is.
    expect(takes(tracked.id)).toEqual({ ok: true, products: [{ name: "Oats", defaultUnit: "g", needs: 80, takes: 50 }] });
    expect(takes(untracked.id)).toEqual({ ok: true, products: [] });
  });

  it("says what Reopen adds back only for a Confirmed Meal", async () => {
    const oats = await product("Oats", 100);
    const confirmed = await lunchOf(oats, 30);
    const planned = await lunchOf(oats, 40, { date: "2026-11-13" });
    await confirmMeal(db, confirmed.id, { untracked: false, today: TODAY });

    const meals = await plannerMeals();
    const meal = (id: string) => meals.find((plannerMeal) => plannerMeal.id === id)!;

    expect(meal(confirmed.id).addsBack).toEqual([{ name: "Oats", defaultUnit: "g", quantity: 30 }]);
    // Confirmed, it has nothing left to take.
    expect(meal(confirmed.id).takes).toEqual({ ok: true, products: [] });
    expect(meal(planned.id).addsBack).toEqual([]);
  });
});
