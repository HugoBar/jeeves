import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { listActiveCategories } from "./food-categories";
import { listActiveMealTypes } from "./meal-types";
import { addMealSlot, createMeal, fillMealSlot, getMeal } from "./meals";
import { createProduct } from "./products";
import { createRecipe } from "./recipes";
import { meals } from "./schema";
import { restockProduct } from "./stock-movements";
import { fillEmptyMealSlots, loadSuggestionContext, undoFill } from "./suggestions";
import { createTestDb } from "./test-database";

let db: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  db = await createTestDb();
});

async function seeded() {
  const categories = await listActiveCategories(db);
  const category = (seedKey: string) => categories.find((found) => found.seedKey === seedKey)!.id;
  const lunch = (await listActiveMealTypes(db)).find((mealType) => mealType.seedKey === "lunch")!;
  return { lunch, mainDish: category("main_dish"), fruit: category("fruit"), grains: category("grains") };
}

async function aProduct(name: string, defaultUnit: "g" | "pc", categoryIds: string[]) {
  const result = await createProduct(db, { name, defaultUnit, density: null, packSize: null, categoryIds });
  if (!result.ok) throw new Error(`Could not create ${name}: ${result.error}`);
  return result.product;
}

describe("loadSuggestionContext", () => {
  it("loads the Meals near the planner's days, the candidates and each Product's last quantity", async () => {
    const { lunch, mainDish, fruit, grains } = await seeded();
    const rice = await aProduct("Rice", "g", [grains]);
    const salt = await aProduct("Salt", "g", []);
    const apple = await aProduct("Apple", "pc", [fruit]);
    await restockProduct(db, rice.id, 500);
    const pilaf = await createRecipe(db, {
      name: "Pilaf",
      portions: 4,
      steps: "Simmer",
      prepTimeMinutes: 30,
      sourceUrl: null,
      ingredients: [
        { productId: rice.id, amount: 200, unit: "g", minor: false },
        { productId: salt.id, amount: 2, unit: "g", minor: true },
      ],
      categoryOverrides: [{ categoryId: mainDish, mode: "add" }],
    });
    const meal = async (date: string, status: "planned" | "confirmed" = "planned") => {
      const created = await createMeal(db, { date, hour: "12:30", name: null, mealTypeId: lunch.id });
      if (status !== "planned") await db.update(meals).set({ status }).where(eq(meals.id, created.id));
      return created;
    };

    // Long before the planner's days: Unconfirmed, it still takes Stock.
    const unconfirmed = await meal("2026-10-01");
    await addMealSlot(db, unconfirmed.id, { slotCategoryId: fruit, fill: { content: "product", productId: apple.id, quantity: 5 } });
    // Long before too, but eaten: neither Stock nor variety needs it.
    const longAgo = await meal("2026-10-02", "confirmed");
    // A few days before the first day: variety compares against it.
    const history = await meal("2026-11-04", "confirmed");
    await addMealSlot(db, history.id, { slotCategoryId: fruit, fill: { content: "product", productId: apple.id, quantity: 2 } });
    const planned = await meal("2026-11-10");
    await addMealSlot(db, planned.id, { slotCategoryId: mainDish, fill: { content: "recipe", recipeId: pilaf.id, portions: 2 } });
    const afterDays = await meal("2026-11-23");

    const context = await loadSuggestionContext(db, "2026-11-09", "2026-11-22");

    expect(context.meals.map((found) => found.id).sort()).toEqual([unconfirmed.id, history.id, planned.id].sort());
    expect(context.meals.map((found) => found.id)).not.toContain(longAgo.id);
    expect(context.meals.map((found) => found.id)).not.toContain(afterDays.id);
    const [historySlot] = (await getMeal(db, history.id))!.slots;
    expect(context.meals.find((found) => found.id === history.id)).toEqual({
      id: history.id,
      date: "2026-11-04",
      hour: "12:30",
      createdAt: expect.any(Date),
      priority: lunch.priority,
      status: "confirmed",
      untracked: false,
      slots: [
        {
          id: historySlot!.id,
          content: "product",
          productId: apple.id,
          quantity: 2,
          slotCategoryId: fruit,
          food: { id: apple.id, categoryIds: [fruit] },
        },
      ],
    });
    const plannedSlot = context.meals.find((found) => found.id === planned.id)!.slots[0]!;
    expect(plannedSlot.food).toEqual({ id: pilaf.id, categoryIds: expect.arrayContaining([grains, mainDish]) });

    expect(context.candidates.find((candidate) => candidate.id === pilaf.id)).toEqual({
      content: "recipe",
      id: pilaf.id,
      categoryIds: expect.arrayContaining([grains, mainDish]),
      recipe: {
        portions: 4,
        ingredients: [
          { productId: rice.id, amount: 200, unit: "g", minor: false },
          { productId: salt.id, amount: 2, unit: "g", minor: true },
        ],
      },
    });
    expect(context.candidates.find((candidate) => candidate.id === apple.id)).toEqual({
      content: "product",
      id: apple.id,
      categoryIds: [fruit],
    });
    expect(context.categories.get(fruit)).toEqual({ kind: "kind", archived: false });
    expect(context.products.get(rice.id)).toEqual({ defaultUnit: "g", density: null, stock: 500 });
    // The latest Meal holding it gives the quantity.
    expect(context.quantities.get(apple.id)).toBe(2);
    expect(context.quantities.has(rice.id)).toBe(false);
  });
});

describe("Fill and its Undo", () => {
  async function aMealWithSlots(count: number, status: "planned" | "confirmed" = "planned") {
    const { lunch, fruit } = await seeded();
    const created = await createMeal(db, { date: "2026-11-12", hour: "12:30", name: null, mealTypeId: lunch.id });
    for (let i = 0; i < count; i++) await addMealSlot(db, created.id, { slotCategoryId: fruit, fill: { content: "empty" } });
    if (status !== "planned") await db.update(meals).set({ status }).where(eq(meals.id, created.id));
    return (await getMeal(db, created.id))!;
  }

  it("fills only slots still empty in a Planned or Unconfirmed Meal, saying which", async () => {
    const pear = await aProduct("Pear", "pc", []);
    const banana = await aProduct("Banana", "pc", []);
    const planned = await aMealWithSlots(2);
    const confirmed = await aMealWithSlots(1, "confirmed");
    const [stillEmpty, filledSince] = planned.slots.map((slot) => slot.id);
    await fillMealSlot(db, filledSince!, { content: "product", productId: banana.id, quantity: 1 });
    const fill = { content: "product" as const, productId: pear.id, quantity: 2 };

    const written = await fillEmptyMealSlots(db, [
      { slotId: stillEmpty!, fill },
      { slotId: filledSince!, fill },
      { slotId: confirmed.slots[0]!.id, fill },
    ]);

    expect(written).toEqual([{ slotId: stillEmpty!, fill }]);
    expect((await getMeal(db, planned.id))!.slots.map((slot) => slot.content === "product" && slot.productId)).toEqual([
      pear.id,
      banana.id,
    ]);
    expect((await getMeal(db, confirmed.id))!.slots[0]!.content).toBe("empty");
  });

  it("Undo empties only the slots still holding what Fill put in", async () => {
    const pear = await aProduct("Pear again", "pc", []);
    const plum = await aProduct("Plum", "pc", []);
    const meal = await aMealWithSlots(3);
    const fill = { content: "product" as const, productId: pear.id, quantity: 2 };
    const fills = meal.slots.map((slot) => ({ slotId: slot.id, fill }));
    await fillEmptyMealSlots(db, fills);
    const [kept, changedFood, changedQuantity] = meal.slots.map((slot) => slot.id);
    await fillMealSlot(db, changedFood!, { content: "product", productId: plum.id, quantity: 2 });
    await fillMealSlot(db, changedQuantity!, { ...fill, quantity: 3 });

    await undoFill(db, fills);

    const slots = (await getMeal(db, meal.id))!.slots;
    expect(slots.find((slot) => slot.id === kept)!.content).toBe("empty");
    expect(slots.find((slot) => slot.id === changedFood)).toMatchObject({ productId: plum.id });
    expect(slots.find((slot) => slot.id === changedQuantity)).toMatchObject({ productId: pear.id, quantity: 3 });
  });
});
