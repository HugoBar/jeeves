import type { CategoryKind } from "@/core/food-categories";
import { addDays, daysBetween, mondayOf } from "@/core/planner";
import { AMOUNT_COLUMN, roundForColumn } from "@/core/amounts";
import {
  projectedStockAt,
  recipeNeeds,
  type ProjectedMeal,
  type ProjectedProduct,
  type ProjectedSlot,
} from "@/core/projected-stock";
import type { Unit } from "@/core/units";

// How many alternatives a slot is offered beside its Suggestion (spec
// "Suggestions"), so 3 foods at most.
export const ALTERNATIVES = 2;

// Variety looks back this many days before the slot, and ahead to the Sunday
// of its week (spec "Suggestions").
export const VARIETY_WINDOW_DAYS = 7;

// How Stock coverage is weighed by how soon the Meal is: fully today (or on
// a day that has passed), falling in a straight line to FARTHEST_DAY_WEIGHT
// at FARTHEST_DAY days away, and staying there after (spec "Suggestions").
export const NEAREST_DAY_WEIGHT = 1;
export const FARTHEST_DAY_WEIGHT = 0.2;
export const FARTHEST_DAY = 6;

// How much each thing counts in a candidate's score. Variety is taken off for
// each matching slot nearby, scaled by how near it is; coverage is added,
// scaled by how much of its need Projected Stock covers and how soon the Meal
// is. Raising `coverage` against the other two favours food already in the
// Pantry over food not eaten recently.
export interface SuggestionWeights {
  // The very same Recipe or Product.
  sameItem: number;
  // Each Kind shared with it, in a slot whose Slot Category is a Role.
  sharedKind: number;
  // Stock coverage, at its fullest.
  coverage: number;
}

export const DEFAULT_SUGGESTION_WEIGHTS: SuggestionWeights = {
  sameItem: 1,
  sharedKind: 0.5,
  coverage: 2,
};

// A Food Category as Suggestions read it. An Archived one is ignored.
export interface SuggestionCategory {
  kind: CategoryKind;
  archived: boolean;
}

// A non-Archived Recipe or Product that could fill the slot. `categoryIds`
// are its final Food Categories, Archived ones included (they are ignored
// here). A Recipe comes with its Ingredients for its stated Portions, Minor
// ones marked.
export type SuggestionCandidate =
  | {
      content: "recipe";
      id: string;
      categoryIds: readonly string[];
      recipe: {
        portions: number;
        ingredients: { productId: string; amount: number; unit: Unit; minor: boolean }[];
      };
    }
  | { content: "product"; id: string; categoryIds: readonly string[] };

// A Meal Slot in the plan or its history: what it takes from Stock, its
// Slot Category, and the Recipe or Product it holds with that food's final
// Food Categories (null when empty or Leftovers).
export type SuggestionSlot = ProjectedSlot & {
  slotCategoryId: string;
  food: { id: string; categoryIds: readonly string[] } | null;
};

export interface SuggestionMeal extends Omit<ProjectedMeal, "slots"> {
  slots: SuggestionSlot[];
}

export interface SuggestionInput {
  // The empty slot to fill.
  slotId: string;
  // Every Meal near it, of any status: the plan, which Projected Stock is
  // worked out from, and the history variety compares against.
  meals: readonly SuggestionMeal[];
  // The non-Archived Recipes and Products, in the order ties keep.
  candidates: readonly SuggestionCandidate[];
  categories: ReadonlyMap<string, SuggestionCategory>;
  // Every Product the Meals' slots and the candidates use, with its Stock.
  products: ReadonlyMap<string, ProjectedProduct>;
  // The viewer's date (spec "Platform").
  today: string;
  // DEFAULT_SUGGESTION_WEIGHTS unless given.
  weights?: SuggestionWeights;
  // Whether a Recipe's Minor Ingredients count toward its Stock coverage.
  // Left out unless told, so missing seasoning doesn't lower a Recipe.
  countMinorIngredients?: boolean;
}

// A food offered for the slot, with the score it was ranked by: higher is
// better, 0 when nothing counts for or against it.
export interface Suggestion {
  content: "recipe" | "product";
  id: string;
  score: number;
}

// A filled slot variety compares against, weighed by how near it is.
interface Compared {
  content: "recipe" | "product";
  id: string;
  kindIds: string[];
  weight: number;
}

// One Suggestion plus up to 2 alternatives for an empty Meal Slot, best
// first. Each candidate starts at 0, gains points for how much of it the
// Pantry is expected to hold at that Meal, and loses points for what was
// eaten, or is planned, near the slot. None for a slot that holds
// something, or whose Meal is Confirmed or Skipped. Nothing carries an
// Archived Slot Category, so such a slot gets none either.
export function suggestForSlot({
  slotId,
  meals,
  candidates,
  categories,
  products,
  today,
  weights = DEFAULT_SUGGESTION_WEIGHTS,
  countMinorIngredients = false,
}: SuggestionInput): Suggestion[] {
  const meal = meals.find((found) => found.slots.some((slot) => slot.id === slotId));
  const slot = meal?.slots.find((found) => found.id === slotId);
  if (!meal || !slot || slot.content !== "empty" || meal.status !== "planned") return [];
  const active = (id: string) => categories.get(id)?.archived === false;
  const kindsOf = (categoryIds: readonly string[]) =>
    categoryIds.filter((id) => active(id) && categories.get(id)!.kind === "kind");
  const roleSlot = categories.get(slot.slotCategoryId)?.kind === "role";
  const compared = nearbySlots(meals, meal.date, slot, kindsOf);
  // Null in an Untracked Meal, which projects no Stock: no bonus there.
  const stock = projectedStockAt(meals, products, slotId);
  const soon = dayWeight(daysBetween(today, meal.date));

  return candidates
    .filter((candidate) => candidate.categoryIds.some((id) => id === slot.slotCategoryId && active(id)))
    .map((candidate) => {
      const kinds = kindsOf(candidate.categoryIds);
      let penalty = 0;
      for (const near of compared) {
        const same = near.content === candidate.content && near.id === candidate.id;
        const shared = roleSlot ? kinds.filter((id) => near.kindIds.includes(id)).length : 0;
        penalty += near.weight * ((same ? weights.sameItem : 0) + shared * weights.sharedKind);
      }
      const bonus = stock ? weights.coverage * coverage(candidate, stock, products, countMinorIngredients) * soon : 0;
      return { content: candidate.content, id: candidate.id, score: bonus - penalty };
    })
    // Stable, so ties keep the candidates' order.
    .toSorted((a, b) => b.score - a.score)
    .slice(0, 1 + ALTERNATIVES);
}

// The filled slots variety compares the slot against (spec "Suggestions"):
// those with the same Slot Category, in Meals not Skipped, from
// VARIETY_WINDOW_DAYS before the slot's day to the Sunday of its week. Each
// is weighed by how near it is: 1 on the same day, then 1/8 less per day
// apart, down to 1/8 at 7 days.
function nearbySlots(
  meals: readonly SuggestionMeal[],
  date: string,
  slot: SuggestionSlot,
  kindsOf: (categoryIds: readonly string[]) => string[],
): Compared[] {
  const [from, to] = [addDays(date, -VARIETY_WINDOW_DAYS), addDays(mondayOf(date), 6)];
  const compared: Compared[] = [];
  for (const meal of meals) {
    if (meal.status === "skipped" || meal.date < from || meal.date > to) continue;
    const weight = (VARIETY_WINDOW_DAYS + 1 - Math.abs(daysBetween(date, meal.date))) / (VARIETY_WINDOW_DAYS + 1);
    for (const near of meal.slots) {
      if (near.id === slot.id || near.slotCategoryId !== slot.slotCategoryId || !near.food) continue;
      if (near.content !== "recipe" && near.content !== "product") continue;
      compared.push({ content: near.content, id: near.food.id, kindIds: kindsOf(near.food.categoryIds), weight });
    }
  }
  return compared;
}

// How much Stock coverage counts for a Meal `days` from today.
function dayWeight(days: number): number {
  const ahead = Math.min(Math.max(days, 0), FARTHEST_DAY);
  return NEAREST_DAY_WEIGHT - ((NEAREST_DAY_WEIGHT - FARTHEST_DAY_WEIGHT) * ahead) / FARTHEST_DAY;
}

// How much of what the candidate needs `stock` holds, from 0 to 1. A
// Product's quantity is only chosen once it is picked, so it counts as
// covered when any of it is in Stock. A Recipe at its stated Portions
// averages, over the Products it needs, how much of each need is in Stock,
// capped at all of it: grams and pieces can't be added up, so each Product
// counts the same. Minor Ingredients count only if `countMinor`. A Product
// whose need can't be worked out (an Ingredient that can't be converted)
// can't be counted on, so it counts as not covered. A Recipe needing nothing
// is covered.
function coverage(
  candidate: SuggestionCandidate,
  stock: ReadonlyMap<string, number>,
  products: ReadonlyMap<string, ProjectedProduct>,
  countMinor: boolean,
): number {
  // Rounded as Stock is stored, so what the walk leaves as 0 is 0.
  const onHand = (productId: string) => roundForColumn(stock.get(productId) ?? 0, AMOUNT_COLUMN);
  if (candidate.content === "product") return onHand(candidate.id) > 0 ? 1 : 0;
  const { portions, ingredients } = candidate.recipe;
  const counted = ingredients.filter((ingredient) => countMinor || !ingredient.minor);
  const { needs, unconvertible } = recipeNeeds({ portions, ingredients: counted }, portions, products);
  const shares = [
    ...[...needs].map(([productId, need]) => (need > 0 ? Math.min(1, onHand(productId) / need) : 1)),
    ...[...new Set(unconvertible.map((ingredient) => ingredient.productId))].map(() => 0),
  ];
  return shares.length === 0 ? 1 : shares.reduce((sum, share) => sum + share, 0) / shares.length;
}
