import { AMOUNT_COLUMN, maxForColumn, parseWholeAboveZero, roundForColumn } from "@/core/amounts";
import { isUnconfirmed, type MealStatus } from "@/core/meals";
import { isDate, plannerWeeks } from "@/core/planner";
import { projectStock, type ProjectedMeal, type ProjectedProduct } from "@/core/projected-stock";
import { parseStockAmount, type QuantityError } from "@/core/stock";
import type { DefaultUnit } from "@/core/units";

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

// What a Product is short of on one day, in its Default Unit.
export interface DatedShortfall {
  productId: string;
  date: string;
  amount: number;
}

// Each Product's Shortfalls on each day, as the Planner works them out,
// added up over that day's Meals, by day. `meals` holds every Meal up to the
// last day wanted, as earlier ones take Stock first.
export function datedShortfalls(
  meals: readonly ProjectedMeal[],
  products: ReadonlyMap<string, ProjectedProduct>,
): DatedShortfall[] {
  const projection = projectStock(meals, products);
  const byKey = new Map<string, DatedShortfall>();
  for (const meal of meals.toSorted((a, b) => a.date.localeCompare(b.date))) {
    for (const slot of meal.slots) {
      for (const { productId, amount } of projection.get(slot.id)?.shortfalls ?? []) {
        const key = `${meal.date} ${productId}`;
        const sum = roundForColumn((byKey.get(key)?.amount ?? 0) + amount, AMOUNT_COLUMN);
        byKey.set(key, { productId, date: meal.date, amount: sum });
      }
    }
  }
  return [...byKey.values()];
}

// A day some Meal's need for a Product can't be worked out (no Density, or a
// unit that can't convert), so what it is short of that day is unknown.
export interface DatedUnknown {
  productId: string;
  date: string;
}

// Each day some Meal's need for a Product can't be worked out, once per
// Product and day, as the Planner works them out. `meals` are as
// datedShortfalls takes them.
export function datedUnknowns(
  meals: readonly ProjectedMeal[],
  products: ReadonlyMap<string, ProjectedProduct>,
): DatedUnknown[] {
  const projection = projectStock(meals, products);
  const byKey = new Map<string, DatedUnknown>();
  for (const meal of meals) {
    for (const slot of meal.slots) {
      for (const productId of projection.get(slot.id)?.unprojectable ?? []) {
        byKey.set(`${meal.date} ${productId}`, { productId, date: meal.date });
      }
    }
  }
  return [...byKey.values()];
}

// What the Meals before `range` are short of, by Product id, in Default
// Units, added up over every earlier day, for the Products Generate over
// `range` asks for too: short in `range`, and worked out there, as
// shortfallsBetween keeps them. Buying what Generate asks for fills these
// earlier gaps first. `shortfalls` are as datedShortfalls gives them and
// `unknown` as datedUnknowns does, in any order.
export function earlierShortfalls(
  shortfalls: readonly DatedShortfall[],
  unknown: readonly DatedUnknown[],
  range: DateRange,
): Map<string, number> {
  const inRange = (date: string) => date >= range.from && date <= range.to;
  const generated = new Set(shortfalls.filter((each) => inRange(each.date)).map((each) => each.productId));
  for (const each of unknown) if (inRange(each.date)) generated.delete(each.productId);
  const earlier = new Map<string, number>();
  for (const { productId, date, amount } of shortfalls) {
    if (date >= range.from || !generated.has(productId)) continue;
    earlier.set(productId, roundForColumn((earlier.get(productId) ?? 0) + amount, AMOUNT_COLUMN));
  }
  return earlier;
}

// Why a Product is running low: none in Stock, or short for a Meal, by
// `amount` on `date`, the first day in range it is short.
export type RunningLowReason = { kind: "outOfStock" } | { kind: "short"; date: string; amount: number };

export interface RunningLow {
  productId: string;
  reason: RunningLowReason;
}

// The Products most likely needed, that have no item on the list, ticked or
// not (`listed`): those at 0 Stock, then those short for a Meal in `range`,
// by the first day they are short. `products` are A to Z, which breaks ties;
// `shortfalls` are as datedShortfalls gives them, in any order.
export function runningLow(
  products: readonly { id: string; stock: number }[],
  shortfalls: readonly DatedShortfall[],
  listed: ReadonlySet<string>,
  range: DateRange,
): RunningLow[] {
  const firstShortfall = new Map<string, DatedShortfall>();
  for (const shortfall of shortfalls) {
    if (shortfall.date < range.from || shortfall.date > range.to) continue;
    const earlier = firstShortfall.get(shortfall.productId);
    if (!earlier || shortfall.date < earlier.date) firstShortfall.set(shortfall.productId, shortfall);
  }
  const unlisted = products.filter((product) => !listed.has(product.id));
  const outOfStock = unlisted
    .filter((product) => product.stock <= 0)
    .map(({ id }): RunningLow => ({ productId: id, reason: { kind: "outOfStock" } }));
  const short = unlisted
    .flatMap(({ id, stock }) => (stock > 0 && firstShortfall.has(id) ? [firstShortfall.get(id)!] : []))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ productId, date, amount }): RunningLow => ({ productId, reason: { kind: "short", date, amount } }));
  return [...outOfStock, ...short];
}

// What Generate needs of an item already on the list. `quantity` is in its
// Product's Default Unit, null for one added by hand without one.
export interface ListedItem {
  id: string;
  productId: string;
  quantity: number | null;
  ticked: boolean;
  source: ShoppingListSource;
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

// What "Restock ticked items" starts an item's amount bought at (spec
// "Shopping List"): the whole packs that cover its amount, or the amount
// without a Pack Size; null, so empty, for an item with no amount. In the
// Product's Default Unit, as is `packAmount`, null without a Pack Size.
export function restockStart(quantity: number | null, packAmount: number | null): number | null {
  if (quantity === null || packAmount === null) return quantity;
  return roundForColumn(packsCovering(quantity, packAmount) * packAmount, AMOUNT_COLUMN);
}

// `packs` whole packs, in the Product's Default Unit, as `packAmount` is,
// rounded as the column keeps it. packsCovering reads it back as `packs`.
export function packsAmount(packs: number, packAmount: number): number {
  return roundForColumn(packs * packAmount, AMOUNT_COLUMN);
}

// How far one step changes an amount set on the list without a Pack Size.
const AMOUNT_STEPS: Record<DefaultUnit, number> = { g: 100, ml: 100, pc: 1 };

// The amount an item's stepper sets on one press, `by` 1 for + and -1 for
// −, in the Product's Default Unit; null when it can't go lower. With a Pack
// Size it moves a whole pack from the packs shown, and never below 1 pack;
// without one it moves a step of its unit, and never below one step. An item
// with no amount starts at 1 pack or one step.
export function stepItemAmount(
  quantity: number | null,
  packAmount: number | null,
  unit: DefaultUnit,
  by: 1 | -1,
): number | null {
  if (packAmount !== null) {
    const packs = (quantity === null ? 0 : packsCovering(quantity, packAmount)) + by;
    return packs < 1 ? null : packsAmount(packs, packAmount);
  }
  const step = AMOUNT_STEPS[unit];
  if (by === 1) return roundForColumn((quantity ?? 0) + step, AMOUNT_COLUMN);
  if (quantity === null || quantity <= step) return null;
  return Math.max(step, roundForColumn(quantity - step, AMOUNT_COLUMN));
}

// Why an amount typed on the list was refused: as Restock refuses one, or,
// with a Pack Size, not a whole number of packs above 0 that the list holds.
export type ItemAmountError = QuantityError | "notWholePacks";

export type ParsedItemAmount = { ok: true; quantity: number } | { ok: false; error: ItemAmountError };

// An amount typed on the list (spec "Shopping List"), in the Product's
// Default Unit: whole packs with a Pack Size, whose amount is `packAmount`;
// without one, an amount read as Restock reads it.
export function parseItemAmount(text: string, packAmount: number | null): ParsedItemAmount {
  if (packAmount === null) return parseStockAmount("restock", text);
  const packs = parseWholeAboveZero(text.trim());
  const quantity = packs === null ? null : packsAmount(packs, packAmount);
  return quantity === null || quantity > maxForColumn(AMOUNT_COLUMN)
    ? { ok: false, error: "notWholePacks" }
    : { ok: true, quantity };
}

// What adding a Product by hand changes: a new item, its unticked item
// raised, or, with no pack to add, its unticked item's amount kept as it is.
// An unticked item it lands on, raised or kept, then counts as added by hand,
// as part of it was chosen (spec "Shopping List").
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

// What unticking an item changes: just its tick, or, when its Product
// already has an unticked item, that item takes its amount and source, and it
// goes.
export type UntickPlan =
  | { kind: "untick" }
  | { kind: "merge"; into: string; quantity: number | null; source: ShoppingListSource };

// A Product has at most one unticked item (data-model T7), so unticking one
// beside it adds the two together, counting no amount as 0; with neither
// holding one the sum has none either. Part of the sum was chosen if either
// was added by hand, so it then counts as added by hand. `items` are its
// Product's items.
export function planUntick(id: string, items: readonly ListedItem[]): UntickPlan {
  const unticked = items.find((item) => !item.ticked && item.id !== id);
  if (!unticked) return { kind: "untick" };
  const own = items.filter((item) => item.id === id);
  const merged = [...own, unticked];
  return { kind: "merge", into: unticked.id, quantity: sumAmounts(merged), source: mergedSource(merged) };
}

// What unticking every item changes: the items left, each its Product's one
// unticked item with the amount and source it now holds, and the items that
// go.
export interface UntickAllPlan {
  keep: { id: string; quantity: number | null; source: ShoppingListSource }[];
  remove: string[];
}

// Unticking the whole list leaves each Product one unticked item (data-model
// T7), so a Product's items are added together, as one untick adds into its
// unticked item: into that one if there is one, else into its first.
export function planUntickAll(items: readonly ListedItem[]): UntickAllPlan {
  const byProduct = new Map<string, ListedItem[]>();
  for (const item of items) byProduct.set(item.productId, [...(byProduct.get(item.productId) ?? []), item]);
  const plan: UntickAllPlan = { keep: [], remove: [] };
  for (const own of byProduct.values()) {
    const kept = own.find((item) => !item.ticked) ?? own[0]!;
    plan.keep.push({ id: kept.id, quantity: sumAmounts(own), source: mergedSource(own) });
    plan.remove.push(...own.filter((item) => item !== kept).map((item) => item.id));
  }
  return plan;
}

// Where items added together came from: by hand if any was, as part of the
// sum was then chosen, else from Shortfalls.
function mergedSource(items: readonly ListedItem[]): ShoppingListSource {
  return items.some((item) => item.source === "manual") ? "manual" : "shortfall";
}

// Items' amounts added together, counting no amount as 0; none if none has one.
function sumAmounts(items: readonly ListedItem[]): number | null {
  if (items.every((item) => item.quantity === null)) return null;
  return roundForColumn(
    items.reduce((sum, item) => sum + (item.quantity ?? 0), 0),
    AMOUNT_COLUMN,
  );
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

// A Meal as the Stock uncertain banner needs it, with the Products its slots
// use: a Product slot's Product and a Recipe slot's Ingredients.
export interface UncertainCandidate {
  status: MealStatus;
  date: string;
  untracked: boolean;
  productIds: readonly string[];
}

// What makes the Shopping List's Stock uncertain on `today`, the viewer's
// date: how many Meals are Unconfirmed, and the Products they use, whose
// amounts may change once they are Confirmed or Skipped. An Untracked Meal
// counts, but takes no Stock, so flags none.
export function stockUncertainty(
  meals: readonly UncertainCandidate[],
  today: string,
): { unconfirmed: number; productIds: Set<string> } {
  const unconfirmed = meals.filter((meal) => isUnconfirmed(meal, today));
  return {
    unconfirmed: unconfirmed.length,
    productIds: new Set(unconfirmed.flatMap((meal) => (meal.untracked ? [] : meal.productIds))),
  };
}
