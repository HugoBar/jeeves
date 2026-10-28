import { connection } from "next/server";
import { sortCategories } from "@/core/food-categories";
import { sortMealTemplates } from "@/core/meal-templates";
import { sortMealTypes } from "@/core/meal-types";
import { plannerRange } from "@/core/planner";
import { getDb } from "@/db";
import { listActiveCategories } from "@/db/food-categories";
import { listMealTemplates } from "@/db/meal-templates";
import { listActiveMealTypes } from "@/db/meal-types";
import { listFoodsForSlots, listMeals, type MealSlotFood } from "@/db/meals";
import { foodCategoryLabel, mealTypeLabel, t } from "@/strings";
import { Planner, type PlannerMeal, type PlannerSlotFood, type SlotFoods } from "./planner";

export default async function PlannerPage() {
  // Read from the database on every request, never at build time.
  await connection();
  const db = getDb();
  // Which two weeks show depends on the viewer's date, known only in the
  // browser, so this loads every Meal any viewer's two weeks could hold.
  const { from, to } = plannerRange(new Date().toISOString().slice(0, 10));
  const [meals, mealTypes, templates, categories, foods] = await Promise.all([
    listMeals(db, from, to),
    listActiveMealTypes(db),
    listMealTemplates(db),
    listActiveCategories(db),
    listFoodsForSlots(db),
  ]);
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
