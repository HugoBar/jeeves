import { AMOUNT_COLUMN, roundForColumn } from "@/core/amounts";
import { isDate, plannerWeeks } from "@/core/planner";
import { projectStock, type ProjectedMeal, type ProjectedProduct } from "@/core/projected-stock";

// Where a Shopping List item came from: Generate, from a Shortfall, or added
// by hand (data-model T7).
export const SHOPPING_LIST_SOURCES = ["shortfall", "manual"] as const;

export type ShoppingListSource = (typeof SHOPPING_LIST_SOURCES)[number];

// What the Meals from `from` to `to` are short of, by Product id, in Default
// Units, summed over their slots. Meals before `from` take Stock first, as
// the Planner's Shortfalls do, so `meals` holds every Meal up to `to`. A
// Product whose need can't be worked out in any of these slots is left out:
// part of what it needs is unknown.
export function shortfallsBetween(
  meals: readonly ProjectedMeal[],
  products: ReadonlyMap<string, ProjectedProduct>,
  from: string,
  to: string,
): Map<string, number> {
  const projection = projectStock(meals, products);
  const totals = new Map<string, number>();
  const unknown = new Set<string>();
  for (const meal of meals) {
    if (meal.date < from || meal.date > to) continue;
    for (const slot of meal.slots) {
      const slotProjection = projection.get(slot.id);
      if (!slotProjection) continue;
      for (const { productId, amount } of slotProjection.shortfalls) {
        totals.set(productId, roundForColumn((totals.get(productId) ?? 0) + amount, AMOUNT_COLUMN));
      }
      for (const productId of slotProjection.unprojectable) unknown.add(productId);
    }
  }
  for (const productId of unknown) totals.delete(productId);
  return totals;
}

// What Generate needs of an item already on the list. `quantity` is in its
// Product's Default Unit, null for one added by hand without one.
export interface ListedItem {
  id: string;
  productId: string;
  quantity: number | null;
  ticked: boolean;
}

// What Generate changes: new unticked items, and unticked items raised to a
// larger quantity. It never lowers, removes or touches a ticked item.
export interface GeneratePlan {
  add: { productId: string; quantity: number }[];
  raise: { id: string; quantity: number }[];
}

// Tops the list up to what is short (spec "Shopping List"). Ticked items
// count as already covered, so each Product's unticked item becomes the
// larger of what it already holds and the Shortfall less its ticked items. An
// item with no quantity counts as 0. `shortfalls` is by Product id, in
// Default Units.
export function planGenerate(shortfalls: ReadonlyMap<string, number>, items: readonly ListedItem[]): GeneratePlan {
  const plan: GeneratePlan = { add: [], raise: [] };
  for (const [productId, shortfall] of shortfalls) {
    const own = items.filter((item) => item.productId === productId);
    const ticked = own.filter((item) => item.ticked).reduce((sum, item) => sum + (item.quantity ?? 0), 0);
    const unticked = own.find((item) => !item.ticked);
    const needed = roundForColumn(shortfall - ticked, AMOUNT_COLUMN);
    if (needed <= (unticked?.quantity ?? 0)) continue;
    if (unticked) plan.raise.push({ id: unticked.id, quantity: needed });
    else plan.add.push({ productId, quantity: needed });
  }
  return plan;
}

// The whole packs that cover `quantity`, both in the Product's Default Unit
// (spec: the Shopping List rounds up to whole packs). Worked out to 6 places
// first, so 1.1 over 0.1 is 11 packs, not 12.
export function packsCovering(quantity: number, packAmount: number): number {
  return Math.ceil(Math.round((quantity / packAmount) * 1e6) / 1e6);
}

// What adding a Product by hand changes: a new item, its unticked item
// raised, or, with no pack to add, its unticked item kept as it is.
export type HandAddPlan =
  | { kind: "add"; quantity: number | null }
  | { kind: "raise"; id: string; quantity: number }
  | { kind: "keep"; id: string };

// Adding a Product by hand puts one pack on the list (spec "Shopping List"):
// on its unticked item if it has one, counting no amount as 0, or on a new
// item beside its ticked ones. Without a Pack Size it goes on with no amount,
// and an unticked item stays as it is. `packAmount` is its Pack Size's
// amount, null without one; `items` are its items already on the list.
export function planAddByHand(packAmount: number | null, items: readonly ListedItem[]): HandAddPlan {
  const unticked = items.find((item) => !item.ticked);
  if (!unticked) return { kind: "add", quantity: packAmount };
  if (packAmount === null) return { kind: "keep", id: unticked.id };
  const quantity = roundForColumn((unticked.quantity ?? 0) + packAmount, AMOUNT_COLUMN);
  return { kind: "raise", id: unticked.id, quantity };
}

// Dates Generate works over, both included.
export interface DateRange {
  from: string;
  to: string;
}

export const GENERATE_PRESETS = ["planned", "next", "both"] as const;

export type GeneratePreset = (typeof GENERATE_PRESETS)[number];

// The ranges Choose dates offers on `today`, the viewer's date: the Planner's
// current week, its next week, and both.
export function generatePresets(today: string): Record<GeneratePreset, DateRange> {
  const { thisWeek, nextWeek } = plannerWeeks(today);
  const planned = { from: thisWeek[0]!, to: thisWeek.at(-1)! };
  const next = { from: nextWeek[0]!, to: nextWeek.at(-1)! };
  return { planned, next, both: { from: planned.from, to: next.to } };
}

// Whether Generate can work over `range` on `today`: real dates in the
// Planner's two weeks, From on or before To.
export function isGenerateRange(today: string, { from, to }: DateRange): boolean {
  if (!isDate(from) || !isDate(to)) return false;
  const { both } = generatePresets(today);
  return both.from <= from && from <= to && to <= both.to;
}

// The dates Generate works over: a preset, whose dates follow the viewer's
// date, or dates of your own.
export type DatesChoice = { preset: GeneratePreset } | { preset: null; range: DateRange };

// The dates `choice` stands for on `today`.
export function chosenRange(choice: DatesChoice, today: string): DateRange {
  return choice.preset ? generatePresets(today)[choice.preset] : choice.range;
}

// `choice` as it stands on `today`: dates of your own left outside the
// Planner's two weeks as the viewer's date moves on, as past midnight on
// Sunday, give way to the planned week.
export function currentChoice(choice: DatesChoice, today: string): DatesChoice {
  return choice.preset || isGenerateRange(today, choice.range) ? choice : { preset: "planned" };
}
