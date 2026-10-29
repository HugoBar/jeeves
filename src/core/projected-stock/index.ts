import { AMOUNT_COLUMN, roundForColumn } from "@/core/amounts";
import type { MealStatus } from "@/core/meals";
import { addDays } from "@/core/planner";
import {
  convertToDefaultUnit,
  type ConversionError,
  type ConvertibleProduct,
  type DefaultUnit,
  type Unit,
} from "@/core/units";

// What projecting needs of a Product: its Stock, in its Default Unit, and
// what converting an Ingredient to that unit needs.
export interface ProjectedProduct {
  defaultUnit: DefaultUnit;
  density: number | null;
  stock: number;
}

// What projecting needs of a Recipe: its Ingredients for its stated
// Portions. Minor Ingredients are deducted too, so they are here as well.
export interface ProjectedRecipe {
  portions: number;
  ingredients: { productId: string; amount: number; unit: Unit }[];
}

// What a Meal Slot needs from Stock. Empty and Leftovers slots need nothing.
export type ProjectedSlot = { id: string } & (
  | { content: "empty" | "leftovers" }
  | { content: "recipe"; portions: number; recipe: ProjectedRecipe }
  | { content: "product"; productId: string; quantity: number }
);

// What projecting needs of a Meal. `priority` is its Meal Type's Meal
// Priority; its slots are in their order.
export interface ProjectedMeal {
  id: string;
  date: string;
  hour: string;
  createdAt: Date;
  priority: number;
  status: MealStatus;
  untracked: boolean;
  slots: ProjectedSlot[];
}

// A Product a slot is short of, by `amount` in its Default Unit.
export interface Shortfall {
  productId: string;
  amount: number;
}

// A slot's warnings. `unprojectable` holds the Products of Ingredients that
// cannot be converted to their Default Unit (no Density, or count against
// mass or volume): what they need is unknown, so their Stock is left as it is.
export interface SlotProjection {
  shortfalls: Shortfall[];
  unprojectable: string[];
}

// The order Meals are served in, competing for Stock: by day, then Meal
// Priority (1 first), then hour, then the Meal created first (spec
// "Projected Stock"). "YYYY-MM-DD" and "HH:MM" text sort as time does.
function servedBefore(a: ProjectedMeal, b: ProjectedMeal): number {
  return (
    a.date.localeCompare(b.date) ||
    a.priority - b.priority ||
    a.hour.localeCompare(b.hour) ||
    a.createdAt.getTime() - b.createdAt.getTime()
  );
}

// An Ingredient that cannot be converted to its Product's Default Unit, as
// written in its Recipe.
export interface UnconvertibleIngredient {
  productId: string;
  amount: number;
  unit: Unit;
  error: ConversionError;
}

// What one slot takes from Stock, by Product, in Default Units, unrounded,
// and the Ingredients whose need cannot be worked out. A Recipe scales by the
// slot's Portions over its own. Confirmation deducts the same needs.
export function slotNeeds(
  slot: ProjectedSlot,
  products: ReadonlyMap<string, ConvertibleProduct>,
): { needs: Map<string, number>; unconvertible: UnconvertibleIngredient[] } {
  const needs = new Map<string, number>();
  const unconvertible: UnconvertibleIngredient[] = [];
  if (slot.content === "product") needs.set(slot.productId, slot.quantity);
  if (slot.content === "recipe") {
    const scale = slot.portions / slot.recipe.portions;
    for (const { productId, amount, unit } of slot.recipe.ingredients) {
      const converted = convertToDefaultUnit(amount, unit, products.get(productId)!);
      if (converted.ok) needs.set(productId, (needs.get(productId) ?? 0) + converted.amount * scale);
      else unconvertible.push({ productId, amount, unit, error: converted.error });
    }
  }
  // Part of what such a Product needs is unknown, so none of it is counted.
  for (const { productId } of unconvertible) needs.delete(productId);
  return { needs, unconvertible };
}

// Each slot's Shortfalls, by slot id, from every Planned or Unconfirmed,
// non-Untracked Meal (spec "Projected Stock"). Untracked Meals have no entry:
// they never project Stock. `products` holds at least every Product the
// slots use, with its current Stock.
//
// A Meal eating more than is left leaves none, never less, so a later Meal is
// short only of what it needs itself: Shortfalls add up to what must be
// bought. A Meal's slots take from Stock in their order.
export function projectStock(
  meals: readonly ProjectedMeal[],
  products: ReadonlyMap<string, ProjectedProduct>,
): Map<string, SlotProjection> {
  const stock = new Map([...products].map(([id, product]) => [id, product.stock]));
  const bySlot = new Map<string, SlotProjection>();
  const projected = meals.filter((meal) => meal.status === "planned" && !meal.untracked);
  for (const meal of projected.toSorted(servedBefore)) {
    for (const slot of meal.slots) {
      const { needs, unconvertible } = slotNeeds(slot, products);
      const shortfalls: Shortfall[] = [];
      for (const [productId, need] of needs) {
        const onHand = stock.get(productId)!;
        const short = roundForColumn(need - onHand, AMOUNT_COLUMN);
        if (short > 0) shortfalls.push({ productId, amount: short });
        stock.set(productId, Math.max(0, onHand - need));
      }
      const unprojectable = [...new Set(unconvertible.map((ingredient) => ingredient.productId))];
      bySlot.set(slot.id, { shortfalls, unprojectable });
    }
  }
  return bySlot;
}

// How a slot's warnings show: "urgent" (red) when its Meal is 1 day away or
// less, its day passed included, "upcoming" (amber) otherwise (spec
// "Projected Stock"). `today` is the viewer's date (spec "Platform").
export type ShortfallUrgency = "urgent" | "upcoming";

export function shortfallUrgency(mealDate: string, today: string): ShortfallUrgency {
  return mealDate <= addDays(today, 1) ? "urgent" : "upcoming";
}
