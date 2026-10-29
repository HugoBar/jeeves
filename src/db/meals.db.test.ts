import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { MealTypeSeedKey } from "@/core/meal-types";
import type { CategorySeedKey } from "@/core/food-categories";
import type { CategoryOverride } from "@/core/recipes";
import { createCategory, getCategory, listActiveCategories, removeCategory } from "./food-categories";
import { confirmMeal, skipMeal } from "./confirmation";
import { createMealTemplate, deleteMealTemplate, updateMealTemplate } from "./meal-templates";
import { createMealType, getMealType, listActiveMealTypes, removeMealType } from "./meal-types";
import {
  addMealSlot,
  createMeal,
  createMealFromTemplate,
  deleteMeal,
  fillMealSlot,
  getMeal,
  getMealSlotContext,
  listFoodsForSlots,
  listMeals,
  listPlannedMealsBefore,
  removeMealSlot,
  setMealSlotCategory,
  setMealUntracked,
  updateMeal,
} from "./meals";
import { createProduct, getProduct, removeProduct } from "./products";
import { createRecipe, getRecipe, removeRecipe } from "./recipes";
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

// A Product under a name no other test uses, carrying the given categories.
async function aProduct(name: string, categoryIds: string[] = []) {
  const result = await createProduct(db, { name, defaultUnit: "g", density: null, packSize: null, categoryIds });
  if (!result.ok) throw new Error(`Could not create ${name}: ${result.error}`);
  return result.product;
}

// A Recipe for 4 Portions made of the given Products, none Minor, with the
// given Food Category overrides.
function aRecipe(name: string, productIds: string[] = [], categoryOverrides: CategoryOverride[] = []) {
  return createRecipe(db, {
    name,
    portions: 4,
    steps: "Cook",
    prepTimeMinutes: 30,
    sourceUrl: null,
    ingredients: productIds.map((productId) => ({ productId, amount: 100, unit: "g", minor: false })),
    categoryOverrides,
  });
}

// One empty slot with the given Slot Category, on a Meal of the given Meal
// Type. Lunch allows Leftovers.
async function anEmptySlot(slotCategoryId: string, mealType: MealTypeSeedKey = "lunch") {
  const template = await createMealTemplate(db, {
    name: "One Slot",
    hour: "12:00",
    mealTypeId: await seededMealTypeId(mealType),
    slotCategoryIds: [slotCategoryId],
  });
  const meal = await createMealFromTemplate(db, { date: "2026-11-10", templateId: template.id });
  await deleteMealTemplate(db, template.id);
  const slot = (await getMeal(db, meal!.id))!.slots[0]!;
  return { mealId: meal!.id, slotId: slot.id };
}

async function slotOf(mealId: string) {
  return (await getMeal(db, mealId))!.slots[0]!;
}

async function slotRow(slotId: string) {
  const [row] = await db.select().from(mealSlots).where(eq(mealSlots.id, slotId));
  return row!;
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

describe("fillMealSlot", () => {
  it("fills a slot with a Recipe and its Portions, shown with the Recipe", async () => {
    const grains = await seededCategoryId("grains");
    const risotto = await aRecipe("Fill Risotto", [(await aProduct("Fill Rice", [grains])).id]);
    const { mealId, slotId } = await anEmptySlot(grains);

    await fillMealSlot(db, slotId, { content: "recipe", recipeId: risotto.id, portions: 2 });

    expect(await slotOf(mealId)).toMatchObject({
      content: "recipe",
      recipeId: risotto.id,
      portions: 2,
      recipe: { name: "Fill Risotto", archived: false },
    });
  });

  it("fills a slot with a Product and a quantity in its Default Unit", async () => {
    const grains = await seededCategoryId("grains");
    const bread = await aProduct("Fill Bread", [grains]);
    const { mealId, slotId } = await anEmptySlot(grains);

    await fillMealSlot(db, slotId, { content: "product", productId: bread.id, quantity: 120.5 });

    expect(await slotOf(mealId)).toMatchObject({
      content: "product",
      productId: bread.id,
      quantity: 120.5,
      product: { name: "Fill Bread", defaultUnit: "g", archived: false },
    });
  });

  it("fills a slot with Leftovers", async () => {
    const { mealId, slotId } = await anEmptySlot(await seededCategoryId("grains"));

    await fillMealSlot(db, slotId, { content: "leftovers" });

    expect(await slotOf(mealId)).toMatchObject({ content: "leftovers" });
  });

  it("changes a filled slot, then empties it, clearing what it held", async () => {
    const grains = await seededCategoryId("grains");
    const bread = await aProduct("Change Bread", [grains]);
    const risotto = await aRecipe("Change Risotto", [bread.id]);
    const { mealId, slotId } = await anEmptySlot(grains);
    await fillMealSlot(db, slotId, { content: "recipe", recipeId: risotto.id, portions: 4 });

    await fillMealSlot(db, slotId, { content: "product", productId: bread.id, quantity: 50 });
    expect(await slotRow(slotId)).toMatchObject({
      content: "product",
      productId: bread.id,
      quantity: 50,
      recipeId: null,
      portions: null,
    });

    await fillMealSlot(db, slotId, { content: "empty" });
    expect(await slotRow(slotId)).toMatchObject({
      content: "empty",
      recipeId: null,
      portions: null,
      productId: null,
      quantity: null,
    });
    expect((await slotOf(mealId)).content).toBe("empty");
  });
});

describe("the meal_slots CHECKs", () => {
  let recipeId: string;
  let productId: string;

  beforeAll(async () => {
    recipeId = (await aRecipe("Check Recipe")).id;
    productId = (await aProduct("Check Product")).id;
  });

  // Writes columns straight to an empty slot, past fillMealSlot.
  async function setColumns(columns: () => Partial<typeof mealSlots.$inferInsert>) {
    const { slotId } = await anEmptySlot(await seededCategoryId("grains"));
    return db.update(mealSlots).set(columns()).where(eq(mealSlots.id, slotId));
  }

  it.each<[string, () => Partial<typeof mealSlots.$inferInsert>]>([
    ["a Recipe slot with no Recipe", () => ({ content: "recipe", portions: 2 })],
    ["a Recipe slot with no Portions", () => ({ content: "recipe", recipeId })],
    ["a Recipe slot with 0 Portions", () => ({ content: "recipe", recipeId, portions: 0 })],
    ["a Recipe slot holding a Product too", () => ({ content: "recipe", recipeId, portions: 2, productId })],
    ["a Product slot with no Product", () => ({ content: "product", quantity: 1 })],
    ["a Product slot with no quantity", () => ({ content: "product", productId })],
    ["a Product slot with a 0 quantity", () => ({ content: "product", productId, quantity: 0 })],
    ["a Product slot with Portions too", () => ({ content: "product", productId, quantity: 1, portions: 1 })],
    ["an empty slot holding a Recipe", () => ({ recipeId, portions: 2 })],
    ["an empty slot with a quantity", () => ({ quantity: 1 })],
    ["Leftovers holding a Product", () => ({ content: "leftovers", productId, quantity: 1 })],
  ])("rejects %s", async (_case, columns) => {
    await expect(setColumns(columns)).rejects.toThrow();
  });

  it("accepts each content kind with only its own columns", async () => {
    await expect(setColumns(() => ({ content: "recipe", recipeId, portions: 1 }))).resolves.toBeDefined();
    await expect(setColumns(() => ({ content: "product", productId, quantity: 0.5 }))).resolves.toBeDefined();
    await expect(setColumns(() => ({ content: "leftovers" }))).resolves.toBeDefined();
  });
});

describe("the Recipe and Product references", () => {
  it("Archives a removed Recipe a Meal Slot uses, and the slot keeps showing it", async () => {
    const grains = await seededCategoryId("grains");
    const risotto = await aRecipe("Archived Risotto", [(await aProduct("Archived Risotto Rice", [grains])).id]);
    const { mealId, slotId } = await anEmptySlot(grains);
    await fillMealSlot(db, slotId, { content: "recipe", recipeId: risotto.id, portions: 3 });

    expect(await removeRecipe(db, risotto.id)).toBe("archived");

    expect(await getRecipe(db, risotto.id)).toBeDefined();
    expect(await slotOf(mealId)).toMatchObject({
      content: "recipe",
      recipeId: risotto.id,
      portions: 3,
      recipe: { name: "Archived Risotto", archived: true },
    });
  });

  it("Archives a removed Product a Meal Slot uses, and the slot keeps showing it", async () => {
    const grains = await seededCategoryId("grains");
    const bread = await aProduct("Archived Bread", [grains]);
    const { mealId, slotId } = await anEmptySlot(grains);
    await fillMealSlot(db, slotId, { content: "product", productId: bread.id, quantity: 80 });

    expect(await removeProduct(db, bread.id)).toBe("archived");

    expect(await getProduct(db, bread.id)).toBeDefined();
    expect(await slotOf(mealId)).toMatchObject({
      content: "product",
      productId: bread.id,
      quantity: 80,
      product: { name: "Archived Bread", archived: true },
    });
  });

  it("still hard deletes a Recipe and a Product once their slots are emptied", async () => {
    const grains = await seededCategoryId("grains");
    const bread = await aProduct("Emptied Bread", [grains]);
    const toast = await aRecipe("Emptied Toast");
    const first = await anEmptySlot(grains);
    const second = await anEmptySlot(grains);
    await fillMealSlot(db, first.slotId, { content: "product", productId: bread.id, quantity: 80 });
    await fillMealSlot(db, second.slotId, { content: "recipe", recipeId: toast.id, portions: 1 });

    await fillMealSlot(db, first.slotId, { content: "empty" });
    await fillMealSlot(db, second.slotId, { content: "empty" });

    expect(await removeProduct(db, bread.id)).toBe("deleted");
    expect(await removeRecipe(db, toast.id)).toBe("deleted");
  });
});

describe("setMealSlotCategory with food in the slot", () => {
  it("keeps a Recipe whose final Food Categories carry the new Slot Category", async () => {
    const [grains, vegetables] = await Promise.all([seededCategoryId("grains"), seededCategoryId("vegetables")]);
    const risotto = await aRecipe("Kept Risotto", [
      (await aProduct("Kept Rice", [grains])).id,
      (await aProduct("Kept Peas", [vegetables])).id,
    ]);
    const { mealId, slotId } = await anEmptySlot(grains);
    await fillMealSlot(db, slotId, { content: "recipe", recipeId: risotto.id, portions: 2 });

    await setMealSlotCategory(db, slotId, vegetables);

    expect(await slotOf(mealId)).toMatchObject({ slotCategoryId: vegetables, content: "recipe", portions: 2 });
  });

  it("empties a slot whose Recipe has the new Slot Category removed by an override", async () => {
    const [grains, vegetables] = await Promise.all([seededCategoryId("grains"), seededCategoryId("vegetables")]);
    const risotto = await aRecipe(
      "Override Risotto",
      [(await aProduct("Override Rice", [grains])).id, (await aProduct("Override Peas", [vegetables])).id],
      [{ categoryId: vegetables, mode: "remove" }],
    );
    const { slotId } = await anEmptySlot(grains);
    await fillMealSlot(db, slotId, { content: "recipe", recipeId: risotto.id, portions: 2 });

    await setMealSlotCategory(db, slotId, vegetables);

    expect(await slotRow(slotId)).toMatchObject({
      slotCategoryId: vegetables,
      content: "empty",
      recipeId: null,
      portions: null,
    });
  });

  it("empties a slot whose Product does not carry the new Slot Category", async () => {
    const [grains, fruit] = await Promise.all([seededCategoryId("grains"), seededCategoryId("fruit")]);
    const bread = await aProduct("Dropped Bread", [grains]);
    const { slotId } = await anEmptySlot(grains);
    await fillMealSlot(db, slotId, { content: "product", productId: bread.id, quantity: 60 });

    await setMealSlotCategory(db, slotId, fruit);

    expect(await slotRow(slotId)).toMatchObject({
      slotCategoryId: fruit,
      content: "empty",
      productId: null,
      quantity: null,
    });
  });

  it("keeps Leftovers, which have no Food Categories", async () => {
    const [grains, fruit] = await Promise.all([seededCategoryId("grains"), seededCategoryId("fruit")]);
    const { mealId, slotId } = await anEmptySlot(grains);
    await fillMealSlot(db, slotId, { content: "leftovers" });

    await setMealSlotCategory(db, slotId, fruit);

    expect(await slotOf(mealId)).toMatchObject({ slotCategoryId: fruit, content: "leftovers" });
  });
});

describe("getMealSlotContext", () => {
  it("gives the slot's Slot Category, its Meal's status and day, and whether its Meal Type allows Leftovers", async () => {
    const grains = await seededCategoryId("grains");
    const lunch = await anEmptySlot(grains, "lunch");
    const breakfast = await anEmptySlot(grains, "breakfast");

    expect(await getMealSlotContext(db, lunch.slotId)).toEqual({
      slotCategoryId: grains,
      allowsLeftovers: true,
      meal: { status: "planned", date: "2026-11-10" },
    });
    expect(await getMealSlotContext(db, breakfast.slotId)).toMatchObject({ allowsLeftovers: false });
  });

  it("is undefined for a slot that is gone", async () => {
    expect(await getMealSlotContext(db, "00000000-0000-4000-8000-000000000000")).toBeUndefined();
  });
});

describe("listFoodsForSlots", () => {
  it("lists non-Archived Recipes with their final Food Categories, and Products with theirs", async () => {
    const [grains, vegetables, fruit] = await Promise.all([
      seededCategoryId("grains"),
      seededCategoryId("vegetables"),
      seededCategoryId("fruit"),
    ]);
    const rice = await aProduct("Listed Rice", [grains]);
    const pilaf = await aRecipe(
      "Listed Pilaf",
      [rice.id, (await aProduct("Listed Peas", [vegetables])).id],
      [
        { categoryId: fruit, mode: "add" },
        { categoryId: vegetables, mode: "remove" },
      ],
    );
    const archivedRecipe = await aRecipe("Listed Archived", [rice.id]);
    const archivedProduct = await aProduct("Listed Archived Product", [grains]);
    const { slotId } = await anEmptySlot(grains);
    await fillMealSlot(db, slotId, { content: "recipe", recipeId: archivedRecipe.id, portions: 1 });
    await fillMealSlot(db, (await anEmptySlot(grains)).slotId, {
      content: "product",
      productId: archivedProduct.id,
      quantity: 1,
    });
    await removeRecipe(db, archivedRecipe.id);
    await removeProduct(db, archivedProduct.id);

    const { recipes, products } = await listFoodsForSlots(db);

    const listedPilaf = recipes.find((recipe) => recipe.id === pilaf.id);
    expect(listedPilaf).toMatchObject({ name: "Listed Pilaf", portions: 4 });
    expect(listedPilaf?.categoryIds.toSorted()).toEqual([grains, fruit].toSorted());
    expect(products.find((product) => product.id === rice.id)).toEqual({
      id: rice.id,
      name: "Listed Rice",
      defaultUnit: "g",
      categoryIds: [grains],
    });
    expect(recipes.map((recipe) => recipe.id)).not.toContain(archivedRecipe.id);
    expect(products.map((product) => product.id)).not.toContain(archivedProduct.id);
  });
});

describe("addMealSlot", () => {
  it("adds a filled slot to a Meal with none", async () => {
    const grains = await seededCategoryId("grains");
    const bread = await aProduct("Added Bread", [grains]);
    const meal = await createMeal(db, { date: "2026-11-12", hour: "12:00", name: null, mealTypeId: await seededMealTypeId("lunch") });

    await addMealSlot(db, meal.id, {
      slotCategoryId: grains,
      fill: { content: "product", productId: bread.id, quantity: 120 },
    });

    expect((await getMeal(db, meal.id))?.slots).toMatchObject([
      { slotCategoryId: grains, content: "product", productId: bread.id, quantity: 120 },
    ]);
  });

  it("adds the slot after the Meal's others", async () => {
    const [grains, vegetables, mainDish] = await Promise.all([
      seededCategoryId("grains"),
      seededCategoryId("vegetables"),
      seededCategoryId("main_dish"),
    ]);
    const template = await createMealTemplate(db, {
      name: "Two Slots",
      hour: "12:00",
      mealTypeId: await seededMealTypeId("lunch"),
      slotCategoryIds: [vegetables, grains],
    });
    const meal = await createMealFromTemplate(db, { date: "2026-11-12", templateId: template.id });
    const risotto = await aRecipe("Added Risotto", [], [{ categoryId: mainDish, mode: "add" }]);

    await addMealSlot(db, meal!.id, {
      slotCategoryId: mainDish,
      fill: { content: "recipe", recipeId: risotto.id, portions: 2 },
    });

    expect((await getMeal(db, meal!.id))?.slots.map((slot) => [slot.slotCategoryId, slot.content])).toEqual([
      [vegetables, "empty"],
      [grains, "empty"],
      [mainDish, "recipe"],
    ]);
  });
});

describe("removeMealSlot", () => {
  // A Meal from a template with the given slots, all empty.
  async function aMealWithSlots(slotCategoryIds: string[]) {
    const template = await createMealTemplate(db, {
      name: "Removing",
      hour: "12:00",
      mealTypeId: await seededMealTypeId("lunch"),
      slotCategoryIds,
    });
    const meal = await createMealFromTemplate(db, { date: "2026-11-13", templateId: template.id });
    await deleteMealTemplate(db, template.id);
    return (await getMeal(db, meal!.id))!;
  }

  it("removes a middle slot, the others keeping their order and renumbered", async () => {
    const [grains, vegetables, fruit, fish] = await Promise.all([
      seededCategoryId("grains"),
      seededCategoryId("vegetables"),
      seededCategoryId("fruit"),
      seededCategoryId("fish"),
    ]);
    const meal = await aMealWithSlots([grains, vegetables, fruit, fish]);

    await removeMealSlot(db, meal.slots[1]!.id);

    const rows = await db
      .select({ slotCategoryId: mealSlots.slotCategoryId, position: mealSlots.position })
      .from(mealSlots)
      .where(eq(mealSlots.mealId, meal.id))
      .orderBy(mealSlots.position);
    expect(rows).toEqual([
      { slotCategoryId: grains, position: 0 },
      { slotCategoryId: fruit, position: 1 },
      { slotCategoryId: fish, position: 2 },
    ]);
  });

  it("removes the first and last slots, and a slot added after leads the order on", async () => {
    const [grains, vegetables, fruit] = await Promise.all([
      seededCategoryId("grains"),
      seededCategoryId("vegetables"),
      seededCategoryId("fruit"),
    ]);
    const meal = await aMealWithSlots([grains, vegetables, fruit]);

    await removeMealSlot(db, meal.slots[0]!.id);
    await removeMealSlot(db, meal.slots[2]!.id);
    const apple = await aProduct("Apple After Removing", [fruit]);
    await addMealSlot(db, meal.id, {
      slotCategoryId: fruit,
      fill: { content: "product", productId: apple.id, quantity: 1 },
    });

    expect((await getMeal(db, meal.id))?.slots.map((slot) => slot.slotCategoryId)).toEqual([vegetables, fruit]);
  });

  it("removes a filled slot, leaving its food", async () => {
    const grains = await seededCategoryId("grains");
    const bread = await aProduct("Removed Slot Bread", [grains]);
    const { mealId, slotId } = await anEmptySlot(grains);
    await fillMealSlot(db, slotId, { content: "product", productId: bread.id, quantity: 100 });

    await removeMealSlot(db, slotId);

    expect((await getMeal(db, mealId))?.slots).toEqual([]);
    expect(await getProduct(db, bread.id)).toBeDefined();
  });

  it("does nothing for a slot that is gone", async () => {
    await expect(removeMealSlot(db, "00000000-0000-4000-8000-000000000000")).resolves.toBeUndefined();
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

describe("listPlannedMealsBefore", () => {
  it("lists the Planned or Unconfirmed Meals before the given day, with their slots", async () => {
    const dinnerId = await seededMealTypeId("dinner");
    const unconfirmed = await createMeal(db, { date: "2025-03-03", hour: "19:00", name: null, mealTypeId: dinnerId });
    const categoryId = await seededCategoryId("red_meat");
    await addMealSlot(db, unconfirmed.id, {
      slotCategoryId: categoryId,
      fill: { content: "product", productId: (await aProduct("Swede", [categoryId])).id, quantity: 300 },
    });
    const confirmed = await createMeal(db, { date: "2025-03-03", hour: "12:00", name: null, mealTypeId: dinnerId });
    await confirmMeal(db, confirmed.id, { untracked: true, today: "2025-03-04" });
    const skipped = await createMeal(db, { date: "2025-03-03", hour: "08:00", name: null, mealTypeId: dinnerId });
    await skipMeal(db, skipped.id, "2025-03-04");
    const onTheDay = await createMeal(db, { date: "2025-03-04", hour: "19:00", name: null, mealTypeId: dinnerId });

    const listed = await listPlannedMealsBefore(db, "2025-03-04");

    expect(listed.find((meal) => meal.id === unconfirmed.id)).toMatchObject({
      status: "planned",
      slots: [{ content: "product", quantity: 300 }],
    });
    const ids = listed.map((meal) => meal.id);
    expect(ids).not.toContain(confirmed.id);
    expect(ids).not.toContain(skipped.id);
    expect(ids).not.toContain(onTheDay.id);
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
