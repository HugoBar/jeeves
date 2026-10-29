import { connection } from "next/server";
import { sortCategories } from "@/core/food-categories";
import { sortMealTemplates } from "@/core/meal-templates";
import { sortMealTypes } from "@/core/meal-types";
import { plannerRange } from "@/core/planner";
import { projectStock, type SlotProjection } from "@/core/projected-stock";
import { getDb } from "@/db";
import { listActiveCategories } from "@/db/food-categories";
import { listMealTemplates } from "@/db/meal-templates";
import { listActiveMealTypes } from "@/db/meal-types";
import { listFoodsForSlots, listMeals, type MealSlotFood } from "@/db/meals";
import { loadStockProjection, type ProjectedProductWithName } from "@/db/projected-stock";
import { foodCategoryLabel, mealTypeLabel, t } from "@/strings";
import { Planner, type PlannerMeal, type PlannerSlotFood, type SlotFoods, type SlotWarnings } from "./planner";

export default async function PlannerPage() {
  // Read from the database on every request, never at build time.
  await connection();
  const db = getDb();
  // Which two weeks show depends on the viewer's date, known only in the
  // browser, so this loads every Meal any viewer's two weeks could hold.
  const { from, to } = plannerRange(new Date().toISOString().slice(0, 10));
  const [meals, mealTypes, templates, categories, foods, projectionInput] = await Promise.all([
    listMeals(db, from, to),
    listActiveMealTypes(db),
    listMealTemplates(db),
    listActiveCategories(db),
    listFoodsForSlots(db),
    // Every Meal before the last day shown takes Stock from the ones shown.
    loadStockProjection(db, to),
  ]);
  // Worked out on every request, so a change to Stock, a Meal Priority, a
  // Recipe or a slot shows in the warnings as soon as the planner does.
  const projection = projectStock(projectionInput.meals, projectionInput.products);
  const plannerMeals: PlannerMeal[] = meals.map((meal) => ({
    id: meal.id,
    date: meal.date,
    hour: meal.hour,
    createdAt: meal.createdAt,
    name: meal.name,
    mealTypeLabel: mealTypeLabel(meal.mealType),
    mealTypeArchived: meal.mealType.archived,
    allowsLeftovers: meal.mealType.allowsLeftovers,
    status: meal.status,
    untracked: meal.untracked,
    slots: meal.slots.map((slot) => ({
      id: slot.id,
      slotCategoryId: slot.slotCategoryId,
      slotCategoryLabel: foodCategoryLabel(slot.slotCategory),
      slotCategoryArchived: slot.slotCategory.archived,
      food: toPlannerSlotFood(slot),
      warnings: toSlotWarnings(projection.get(slot.id), projectionInput.products),
    })),
  }));
  // The picker offers only Meal Types that are not Archived.
  const mealTypeOptions = sortMealTypes(mealTypes, mealTypeLabel).map((mealType) => ({
    id: mealType.id,
    label: mealTypeLabel(mealType),
  }));

  const templateOptions = sortMealTemplates(templates).map((template) => ({ id: template.id, label: template.name }));
  // A slot's picker offers only Food Categories that are not Archived. A slot
  // added by hand is offered its food's Roles, else Kinds, in this order too.
  const slotCategoryOptions = sortCategories(categories, foodCategoryLabel).map((category) => ({
    id: category.id,
    label: foodCategoryLabel(category),
    kind: category.kind,
  }));

  // Each slot's fill picker offers those of these carrying its Slot Category;
  // adding a slot offers them all.
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  const slotFoods: SlotFoods = {
    recipes: foods.recipes.toSorted(byName).map(({ name, ...recipe }) => ({ ...recipe, label: name })),
    products: foods.products.toSorted(byName).map(({ name, ...product }) => ({ ...product, label: name })),
  };

  return (
    <section>
      <h1>{t("planner.title")}</h1>
      <Planner
        meals={plannerMeals}
        mealTypes={mealTypeOptions}
        templates={templateOptions}
        slotCategories={slotCategoryOptions}
        slotFoods={slotFoods}
      />
    </section>
  );
}

// A slot's Shortfalls and unprojectable Products, by Product name; null when
// there are none, or its Meal is Untracked and has no projection.
function toSlotWarnings(
  slot: SlotProjection | undefined,
  products: ReadonlyMap<string, ProjectedProductWithName>,
): SlotWarnings | null {
  if (!slot || (slot.shortfalls.length === 0 && slot.unprojectable.length === 0)) return null;
  return {
    shortfalls: slot.shortfalls.map(({ productId, amount }) => {
      const { name, defaultUnit } = products.get(productId)!;
      return { name, amount, defaultUnit };
    }),
    unprojectable: slot.unprojectable.map((id) => products.get(id)!.name),
  };
}

function toPlannerSlotFood(food: MealSlotFood): PlannerSlotFood {
  switch (food.content) {
    case "recipe":
      return {
        content: "recipe",
        id: food.recipeId,
        label: food.recipe.name,
        portions: food.portions,
        archived: food.recipe.archived,
      };
    case "product":
      return {
        content: "product",
        id: food.productId,
        label: food.product.name,
        quantity: food.quantity,
        defaultUnit: food.product.defaultUnit,
        archived: food.product.archived,
      };
    default:
      return { content: food.content };
  }
}
