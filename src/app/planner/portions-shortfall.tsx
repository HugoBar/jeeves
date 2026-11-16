"use client";

import { createContext, useContext } from "react";
import { isHour } from "@/core/meals";
import { recipeShortfallsAt, shortfallUrgency, type ProjectedSlot, type StockPlace } from "@/core/projected-stock";
import type { SuggestionContext } from "@/db/suggestions";
import { formatQuantity, t } from "@/strings";
import { AlertIcon } from "../form-error";
import type { PlannerMeal, PlannerMealSlot } from "./meal-card";
import { useViewerNow } from "../viewer-clock";

// What the Planner knows of Stock for the Portions step: the plan, Stock and
// Recipes it loads for Suggestions, and each Meal Type's Meal Priority.
export interface PlannerStock {
  context: Pick<SuggestionContext, "meals" | "candidates" | "products">;
  priorities: ReadonlyMap<string, number>;
}

// None outside the Planner, so no warning shows there.
const PlannerStockContext = createContext<PlannerStock | null>(null);

export const PlannerStockProvider = PlannerStockContext.Provider;

// Where a Recipe on the Portions step would go: in the Meal `mealId`, or a
// new one (null) of `mealTypeId`, as its form stands, after `slotsBefore`.
export interface PortionsPlace {
  mealId: string | null;
  mealTypeId?: string;
  date: string;
  hour: string;
  untracked: boolean;
  slotsBefore: readonly PlannerMealSlot[];
}

const NEW_MEAL_ID = "\u0000new-meal";

// Where a slot goes in `meal`: after `slotsBefore`, all its slots unless
// given, with its hour and Untracked as saved.
export function placeIn(
  meal: Pick<PlannerMeal, "id" | "date" | "hour" | "untracked" | "slots">,
  slotsBefore: readonly PlannerMealSlot[] = meal.slots,
): PortionsPlace {
  return { mealId: meal.id, date: meal.date, hour: meal.hour, untracked: meal.untracked, slotsBefore };
}

// `place` in the plan core walks. A saved Meal keeps its Meal Priority and
// when it was created; a new one is created now, so it comes after the
// Meals it ties with. A Meal Type not picked yet, or an hour not typed yet,
// put it last on its day. A slot keeps what it holds saved, unless it was
// added on the form, which holds what was picked.
export function toStockPlace({ context, priorities }: PlannerStock, place: PortionsPlace): StockPlace {
  const saved = place.mealId === null ? undefined : context.meals.find((meal) => meal.id === place.mealId);
  const savedSlots = new Map(saved?.slots.map((slot) => [slot.id, slot]));
  const pickedPriority = place.mealTypeId === undefined ? undefined : priorities.get(place.mealTypeId);
  return {
    meal: {
      id: place.mealId ?? NEW_MEAL_ID,
      date: place.date,
      hour: isHour(place.hour) ? place.hour : "23:59",
      createdAt: saved?.createdAt ?? new Date(),
      priority: saved?.priority ?? pickedPriority ?? Number.MAX_SAFE_INTEGER,
      status: saved?.status ?? "planned",
      untracked: place.untracked,
    },
    slotsBefore: place.slotsBefore.map((slot) => savedSlots.get(slot.id) ?? draftProjectedSlot(context, slot)),
  };
}

// A slot added on the form, as what it takes from Stock.
function draftProjectedSlot(context: PlannerStock["context"], { id, food }: PlannerMealSlot): ProjectedSlot {
  if (food.content === "product") return { id, content: "product", productId: food.id, quantity: food.quantity };
  const recipe = food.content === "recipe" ? candidateRecipe(context, food.id) : undefined;
  if (food.content === "recipe" && recipe) return { id, content: "recipe", portions: food.portions, recipe };
  return { id, content: "empty" };
}

// A non-Archived Recipe's Ingredients for its own Portions.
function candidateRecipe(context: PlannerStock["context"], recipeId: string) {
  for (const candidate of context.candidates) {
    if (candidate.content === "recipe" && candidate.id === recipeId) return candidate.recipe;
  }
  return undefined;
}

// Under the Portions: "Short 200 g Basmati rice at this Meal" for each
// Product the Recipe at `portions` would be short of at `place`, and that it
// is a warning only. Nothing when none is short, outside the Planner, or
// while the Portions typed aren't a whole number above 0.
export function PortionsShortfall({ place, recipeId, portions }: { place: PortionsPlace; recipeId: string; portions: string }) {
  const stock = useContext(PlannerStockContext);
  const today = useViewerNow()?.date;
  const count = Number(portions);
  if (!stock || !today || !Number.isInteger(count) || count <= 0) return null;
  const recipe = candidateRecipe(stock.context, recipeId);
  if (!recipe) return null;
  const { products } = stock.context;
  const shortfalls = recipeShortfallsAt(stock.context.meals, products, toStockPlace(stock, place), recipe, count);
  if (shortfalls.length === 0) return null;
  return (
    <div className={`slot-strip slot-strip-${shortfallUrgency(place.date, today)} portions-shortfall`} role="status">
      {shortfalls.map(({ productId, amount }) => {
        const { name, defaultUnit } = products.get(productId)!;
        return (
          <p key={productId}>
            <AlertIcon />
            {t("planner.picker.portionsShort", { quantity: formatQuantity(amount, defaultUnit), name })}
          </p>
        );
      })}
      <p className="portions-shortfall-note">{t("planner.picker.portionsShortNote")}</p>
    </div>
  );
}
