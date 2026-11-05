import "server-only";
import { sortCategories } from "@/core/food-categories";
import { sortMealTemplates } from "@/core/meal-templates";
import { sortMealTypes } from "@/core/meal-types";
import { projectStock, type SlotProjection } from "@/core/projected-stock";
import type { Db } from "@/db";
import { listReopenAddsBack } from "@/db/confirmation";
import { listActiveCategories } from "@/db/food-categories";
import { listMealTemplates, listPickableMealTypes, listPickableSlotCategories, type MealTemplate } from "@/db/meal-templates";
import { listActiveMealTypes } from "@/db/meal-types";
import { listFoodsForSlots, type Meal, type MealSlotFood } from "@/db/meals";
import { loadStockProjection, type ProjectedProductWithName } from "@/db/projected-stock";
import { foodCategoryLabel, mealTypeLabel } from "@/strings";
import type { Pickers, PlannerMeal, PlannerSlotFood, SlotWarnings, TemplateOption } from "./meal-card";

// The Meals as their cards show them, each slot with its warnings. `to` is the
// last day any of them can be on: every Meal up to it takes Stock from them.
export async function toPlannerMeals(db: Db, meals: Meal[], to: string): Promise<PlannerMeal[]> {
  const projectionInput = await loadStockProjection(db, to);
  // Worked out on every request, so a change to Stock, a Meal Priority, a
  // Recipe or a slot shows in the warnings as soon as the planner does.
  const projection = projectStock(projectionInput.meals, projectionInput.products);
  // Only a Confirmed Meal took anything for a Reopen to add back.
  const addsBack = await listReopenAddsBack(
    db,
    meals.filter((meal) => meal.status === "confirmed").map((meal) => meal.id),
  );
  return meals.map((meal) => ({
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
    addsBack: addsBack.get(meal.id) ?? [],
  }));
}

export async function loadPickers(db: Db): Promise<Pickers> {
  const [mealTypes, templates, categories, foods] = await Promise.all([
    listActiveMealTypes(db),
    listMealTemplates(db),
    listActiveCategories(db),
    listFoodsForSlots(db),
  ]);
  // The picker offers only Meal Types that are not Archived.
  const mealTypeOptions = sortMealTypes(mealTypes, mealTypeLabel).map((mealType) => ({
    id: mealType.id,
    label: mealTypeLabel(mealType),
  }));

  const templateOptions = await toTemplateOptions(db, templates);
  // By id, so each shows once however many template slots use it.
  const archivedSlotCategories = new Map(
    templateOptions
      .flatMap((template) => template.slots)
      .filter((slot) => slot.archived)
      .map((slot) => [slot.slotCategoryId, slot.label]),
  );
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
  return {
    mealTypes: mealTypeOptions,
    templates: templateOptions,
    slotCategories: slotCategoryOptions,
    archivedSlotCategories: [...archivedSlotCategories].map(([id, label]) => ({ id, label })),
    slotFoods: {
      recipes: foods.recipes.toSorted(byName).map(({ name, ...recipe }) => ({ ...recipe, label: name })),
      products: foods.products.toSorted(byName).map(({ name, ...product }) => ({ ...product, label: name })),
    },
  };
}

// The Meal Templates as Add a Meal lists them: by Meal Type, in the order the
// Meal Type picker lists them, then by hour. A template's Meal Type and Slot
// Categories may be Archived; those Meal Types come last.
async function toTemplateOptions(db: Db, templates: MealTemplate[]): Promise<TemplateOption[]> {
  const ids = templates.map((template) => template.id);
  const [mealTypes, categories] = await Promise.all([
    listPickableMealTypes(db, ids),
    listPickableSlotCategories(db, ids),
  ]);
  const order = sortMealTypes(mealTypes, mealTypeLabel).sort((a, b) => Number(a.archived) - Number(b.archived));
  const byId = <T extends { id: string }>(items: T[]) => new Map(items.map((item) => [item.id, item]));
  const [mealTypeById, categoryById] = [byId(mealTypes), byId(categories)];
  const rank = new Map(order.map((mealType, index) => [mealType.id, index]));
  return sortMealTemplates(templates)
    .sort((a, b) => rank.get(a.mealTypeId)! - rank.get(b.mealTypeId)!)
    .map((template) => {
      const mealType = mealTypeById.get(template.mealTypeId)!;
      return {
        id: template.id,
        label: template.name,
        hour: template.hour,
        mealType: { id: mealType.id, label: mealTypeLabel(mealType), archived: mealType.archived },
        slots: template.slotCategoryIds.map((slotCategoryId) => {
          const category = categoryById.get(slotCategoryId)!;
          return { slotCategoryId, label: foodCategoryLabel(category), archived: category.archived };
        }),
      };
    });
}

// A slot's Shortfalls and unprojectable Products, by Product name; null when
// there are none, or its Meal is Untracked or Confirmed and has no projection.
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
