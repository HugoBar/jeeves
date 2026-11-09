"use client";

import { createContext, useContext, useTransition } from "react";
import { slotFoodValue } from "@/core/meals";
import {
  suggestForSlot,
  suggestionFill,
  type FoodFill,
  type SlotFill,
  type SuggestionCandidate,
} from "@/core/suggestions";
import type { SuggestionContext } from "@/db/suggestions";
import { t } from "@/strings";
import { fillMealSlotAction, type FillOutcome } from "./actions";
import type { PlannerMeal, PlannerMealSlot, PlannerSlotFood, SlotFoods } from "./meal-card";

// A Suggestion as the planner shows it: the Recipe or Product by the name the
// user sees, and what Use puts in the slot. `fill` is null for a Product
// never in a Meal Slot: Use asks for its quantity.
export interface SlotSuggestion {
  content: "recipe" | "product";
  id: string;
  label: string;
  fill: FoodFill | null;
}

// Each empty slot's Suggestion and alternatives, best first, by slot id
// (spec "Suggestions"). Only slots that have some are listed. `today` is the
// viewer's date, which how soon each Meal is depends on.
export function suggestionsBySlot(
  context: SuggestionContext,
  meals: readonly PlannerMeal[],
  today: string,
  slotFoods: SlotFoods,
): Map<string, SlotSuggestion[]> {
  const candidates = new Map(context.candidates.map((candidate) => [valueOf(candidate), candidate]));
  const labels = new Map([
    ...slotFoods.recipes.map((recipe) => [slotFoodValue("recipe", recipe.id), recipe.label] as const),
    ...slotFoods.products.map((product) => [slotFoodValue("product", product.id), product.label] as const),
  ]);
  const bySlot = new Map<string, SlotSuggestion[]>();
  for (const meal of meals) {
    if (meal.status !== "planned") continue;
    for (const slot of meal.slots) {
      if (slot.food.content !== "empty") continue;
      const suggestions = suggestForSlot({ ...context, slotId: slot.id, today }).flatMap(({ content, id }) => {
        const value = slotFoodValue(content, id);
        const [candidate, label] = [candidates.get(value), labels.get(value)];
        // Both come from the same Recipes and Products, loaded together.
        if (!candidate || label === undefined) return [];
        return [{ content, id, label, fill: suggestionFill(candidate, context.quantities) }];
      });
      if (suggestions.length > 0) bySlot.set(slot.id, suggestions);
    }
  }
  return bySlot;
}

const valueOf = (candidate: SuggestionCandidate) => slotFoodValue(candidate.content, candidate.id);

// The slots of a Meal that a fill put food in, and what the Meal held right
// after, as mealState gives it.
export interface FilledMeal {
  slotIds: ReadonlySet<string>;
  after: string;
}

// What the planner knows of Suggestions: each empty slot's, by slot id; the
// Meals fills put food in, by Meal id; and what to do with a fill's result.
// `undoable` is false for "Use all", as only "Fill empty slots" has Undo.
export interface PlannerSuggestions {
  bySlot: ReadonlyMap<string, SlotSuggestion[]>;
  filled: ReadonlyMap<string, FilledMeal>;
  onFilled: (outcome: FillOutcome, undoable: boolean) => void;
}

const SuggestionsContext = createContext<PlannerSuggestions>({
  bySlot: new Map(),
  filled: new Map(),
  onFilled: () => {},
});

export const SuggestionsProvider = SuggestionsContext.Provider;

export function usePlannerSuggestions(): PlannerSuggestions {
  return useContext(SuggestionsContext);
}

// The slots of `meal` that show as just filled: until the Meal is edited in
// any way (its hour, name, Untracked, or any slot added, removed, moved or
// changed), or the Planner is left.
export function freshSlotIds(meal: PlannerMeal, filled: ReadonlyMap<string, FilledMeal>): ReadonlySet<string> {
  const entry = filled.get(meal.id);
  return entry && mealState(meal) === entry.after ? entry.slotIds : new Set();
}

// `filled` with each Meal holding one of `fills` recorded as it stands with
// them in. A Meal still showing an earlier fill keeps those slots too.
export function recordFills(
  filled: ReadonlyMap<string, FilledMeal>,
  meals: readonly PlannerMeal[],
  fills: readonly SlotFill[],
): Map<string, FilledMeal> {
  const next = new Map(filled);
  const bySlot = new Map(fills.map(({ slotId, fill }) => [slotId, fill]));
  for (const meal of meals) {
    const mine = meal.slots.filter((slot) => bySlot.has(slot.id)).map((slot) => slot.id);
    if (mine.length === 0) continue;
    const earlier = freshSlotIds(meal, filled);
    next.set(meal.id, { slotIds: new Set([...earlier, ...mine]), after: mealState(meal, bySlot) });
  }
  return next;
}

// Everything an edit to `meal` can change, as text, with `fills` put in its
// slots: equal texts mean the Meal wasn't edited.
function mealState(meal: PlannerMeal, fills: ReadonlyMap<string, FoodFill> = new Map()): string {
  const slots = meal.slots.map((slot) => {
    const fill = fills.get(slot.id);
    return [slot.id, slot.slotCategoryId, fill ? fillState(fill) : foodState(slot.food)];
  });
  return JSON.stringify([meal.hour, meal.name, meal.untracked, slots]);
}

function foodState(food: PlannerSlotFood): string {
  if (food.content === "recipe") return `recipe:${food.id}:${food.portions}`;
  if (food.content === "product") return `product:${food.id}:${food.quantity}`;
  return food.content;
}

function fillState(fill: FoodFill): string {
  return fill.content === "recipe" ? `recipe:${fill.recipeId}:${fill.portions}` : `product:${fill.productId}:${fill.quantity}`;
}

// The fill form's fields for `fill`, as fillMealSlotAction reads them.
function fillForm(fill: FoodFill): FormData {
  const form = new FormData();
  if (fill.content === "recipe") {
    form.set("food", slotFoodValue("recipe", fill.recipeId));
    form.set("amount", String(fill.portions));
  } else {
    form.set("food", slotFoodValue("product", fill.productId));
    form.set("amount", String(fill.quantity));
  }
  return form;
}

// Under an empty slot: its Suggestion with Use, and its alternatives, each
// one tap from filling the slot. A Product never in a Meal Slot has no
// quantity yet, so `onAskQuantity` opens the slot picker to ask for it.
export function SlotSuggestionBox({
  slot,
  suggestions,
  onAskQuantity,
}: {
  slot: PlannerMealSlot;
  suggestions: readonly SlotSuggestion[];
  onAskQuantity: (suggestion: SlotSuggestion) => void;
}) {
  const [pending, startTransition] = useTransition();
  const use = (suggestion: SlotSuggestion) => {
    const { fill } = suggestion;
    if (!fill) return onAskQuantity(suggestion);
    startTransition(async () => {
      await fillMealSlotAction(slot.id, { error: null }, fillForm(fill));
    });
  };
  const [first, ...alternatives] = suggestions;
  if (!first) return null;
  return (
    <div className="slot-suggestion">
      <div className="slot-suggestion-main">
        <span className="slot-suggestion-text">
          <span className="slot-suggestion-label">{t("planner.suggestion")}</span>
          <span className="slot-suggestion-name">{first.label}</span>
        </span>
        <button
          type="button"
          className="slot-suggestion-use"
          aria-label={t("planner.suggestion.useLabel", { food: first.label, category: slot.slotCategoryLabel })}
          disabled={pending}
          onClick={() => use(first)}
        >
          {t("planner.suggestion.use")}
        </button>
      </div>
      {alternatives.length > 0 && (
        <div className="slot-suggestion-alternatives">
          <span>{t("planner.suggestion.or")}</span>
          {alternatives.map((alternative) => (
            <button
              key={slotFoodValue(alternative.content, alternative.id)}
              type="button"
              className="slot-suggestion-alternative"
              aria-label={t("planner.suggestion.altLabel", { food: alternative.label })}
              disabled={pending}
              onClick={() => use(alternative)}
            >
              {alternative.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
