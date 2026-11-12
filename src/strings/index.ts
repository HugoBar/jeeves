import type { CategorySeedKey } from "@/core/food-categories";
import type { Weekday } from "@/core/meal-series";
import type { MealTypeSeedKey } from "@/core/meal-types";
import type { Week } from "@/core/planner";
import type { PackSize } from "@/core/products";
import type { DefaultUnit, Unit } from "@/core/units";
import { en } from "./en";

export type StringKey = keyof typeof en;

export function t(key: StringKey, params?: Record<string, string | number>): string {
  const text: string = en[key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

// Seeded categories are stored by key (data-model Q7); a rename stores a name,
// which wins over the key's string. Every row has at least one of the two.
export function foodCategoryLabel(category: {
  seedKey: CategorySeedKey | null;
  name: string | null;
}): string {
  return category.name ?? t(`foodCategory.${category.seedKey!}`);
}

// Same rule as Food Categories (data-model Q7).
export function mealTypeLabel(mealType: { seedKey: MealTypeSeedKey | null; name: string | null }): string {
  return mealType.name ?? t(`mealType.${mealType.seedKey!}`);
}

const quantityFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });

// An amount in a unit, as shown to the user: "1,250 g".
export function formatQuantity(amount: number, unit: Unit): string {
  return `${quantityFormat.format(amount)} ${t(`unit.${unit}`)}`;
}

// How many Products there are: "1 Product", "24 Products".
export function formatProductCount(count: number): string {
  return count === 1 ? t("stock.countOne") : t("stock.count", { count });
}

// How many Recipes there are: "1 Recipe", "8 Recipes".
export function formatRecipeCount(count: number): string {
  return count === 1 ? t("recipes.countOne") : t("recipes.count", { count });
}

// How many Meals there are: "1 Meal", "9 Meals".
export function formatMealCount(count: number): string {
  return count === 1 ? t("planner.mealCountOne") : t("planner.mealCount", { count });
}

// How many slots a Meal Template has: "1 slot", "3 slots".
export function formatSlotCount(count: number): string {
  return count === 1 ? t("planner.slotCountOne") : t("planner.slotCount", { count });
}

// What "Fill empty slots" did: "Filled 6 empty slots with Suggestions",
// with "· 1 left empty: no quantity yet" for Product Suggestions never in a
// Meal Slot.
export function formatFillOutcome(filled: number, noQuantity: number): string {
  const done =
    filled === 0 ? t("planner.fill.nothing") : filled === 1 ? t("planner.fill.doneOne") : t("planner.fill.done", { count: filled });
  return noQuantity === 0 ? done : `${done} · ${t("planner.fill.noQuantity", { count: noQuantity })}`;
}

// How many items the Shopping List holds: "1 item", "5 items".
export function formatShoppingCount(count: number): string {
  return count === 1 ? t("shopping.countOne") : t("shopping.count", { count });
}

// "Restock ticked items" for how many are ticked: "Restock 2 ticked items".
export function formatRestockTicked(count: number): string {
  return count === 1 ? t("shopping.restockTickedOne") : t("shopping.restockTicked", { count });
}

// Its sheet's button: "Restock 2 items".
export function formatRestockSubmit(count: number): string {
  return count === 1 ? t("shopping.restockSubmitOne") : t("shopping.restockSubmit", { count });
}

// A pack's name, typed by the user, in running text: a capital starting it
// is dropped, as in a sentence, but "XL bag" keeps its letters.
function inSentence(name: string): string {
  return name.replace(/^\p{Lu}(?!\p{Lu})/u, (capital) => capital.toLowerCase());
}

// Whole packs of a Pack Size: "1 bag", "2 cartons", "3 boxes".
export function formatPacks(count: number, name: string): string {
  return t("shopping.packs", { count: quantityFormat.format(count), name: formatPackName(count, name) });
}

// A Pack Size's name for `count` packs, without the count: "bag", "boxes".
export function formatPackName(count: number, name: string): string {
  const lower = inSentence(name);
  return count === 1 ? lower : /(s|x|z|ch|sh)$/i.test(lower) ? `${lower}es` : `${lower}s`;
}

// A Recipe's Portions in running text: "1 portion", "1,800 portions".
export function formatPortions(portions: number): string {
  return portions === 1
    ? t("recipes.portionsAmountOne")
    : t("recipes.portionsAmount", { portions: quantityFormat.format(portions) });
}

const listFormat = new Intl.ListFormat("en", { type: "conjunction" });

// Items as a sentence lists them: "a and b", "a, b, and c".
export function formatList(items: readonly string[]): string {
  return listFormat.format(items);
}

// A moment's day as shown to the user: "23 Oct", in the time zone of whoever
// runs it. Day and month are asked for apart because en-GB writes "Sept", and
// "en" alone would put the month first.
export function formatDayMonth(value: Date): string {
  return `${value.toLocaleDateString("en", { day: "numeric" })} ${value.toLocaleDateString("en", { month: "short" })}`;
}

// A Pack Size as shown to the user: "Bag · 1,000 g". Its amount is in the
// Product's Default Unit.
export function formatPackSize({ name, amount }: PackSize, unit: DefaultUnit): string {
  return t("products.packSizeValue", {
    name: `${name.charAt(0).toUpperCase()}${name.slice(1)}`,
    quantity: formatQuantity(amount, unit),
  });
}

// A Pack Size where a Product is added by hand: "Pack Size · box, 500 g".
export function formatAddPackSize({ name, amount }: PackSize, unit: DefaultUnit): string {
  return t("shopping.addPackSize", { name: inSentence(name), quantity: formatQuantity(amount, unit) });
}

// A Pack Size in a sentence: "Pack Size is a 1,000 g bag." The amount is
// spoken right after the article, so eight and eleven take "an".
export function formatPackSizeNote({ name, amount }: PackSize, unit: DefaultUnit): string {
  const quantity = formatQuantity(amount, unit);
  return t(/^(8|1[18](,\d{3})*(\.| ))/.test(quantity) ? "products.packSizeNoteAn" : "products.packSizeNote", {
    quantity,
    name: inSentence(name),
  });
}

// A Stock Movement's delta with its sign: "+500 g", "-1.5 pc".
export function formatDelta(delta: number, unit: DefaultUnit): string {
  return `${delta > 0 ? "+" : ""}${formatQuantity(delta, unit)}`;
}

// Planner days are plain "YYYY-MM-DD" dates with no time zone, so they are
// read and shown at UTC midnight, where the date never shifts.
function dayPart(date: string, options: Intl.DateTimeFormatOptions): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en", { ...options, timeZone: "UTC" });
}

// A range of dates, as a planner week's header shows it: "19–25 Oct", "26
// Oct–1 Nov" when it runs into the next month, or "20 Nov" for one day.
export function formatDateRange(first: string, last: string): string {
  const day = (date: string) => dayPart(date, { day: "numeric" });
  const month = (date: string) => dayPart(date, { month: "short" });
  if (first === last) return `${day(first)} ${month(first)}`;
  return month(first) === month(last)
    ? `${day(first)}–${day(last)} ${month(last)}`
    : `${day(first)} ${month(first)}–${day(last)} ${month(last)}`;
}

// A planner day's weekday and day of the month, apart: "Sun" and "1".
export function dayHeadingParts(date: string): { weekday: string; day: string } {
  return { weekday: dayPart(date, { weekday: "short" }), day: dayPart(date, { day: "numeric" }) };
}

// A planner day's heading: "Sun 1".
export function formatDayHeading(date: string): string {
  const { weekday, day } = dayHeadingParts(date);
  return `${weekday} ${day}`;
}

// A planner day's heading on phone: "Thursday 29".
export function formatLongDayHeading(date: string): string {
  return `${dayPart(date, { weekday: "long" })} ${dayPart(date, { day: "numeric" })}`;
}

// A Meal's date off the planner: "Mon 12 Oct".
export function formatMealDate(date: string): string {
  return `${formatDayHeading(date)} ${dayPart(date, { month: "short" })}`;
}

// A Confirmation's Meal in Stock history: "Tue Dinner · Rice bowl", or "Tue
// Dinner" for a Meal with no name.
export function formatMovementMeal({
  date,
  name,
  mealType,
}: {
  date: string;
  name: string | null;
  mealType: { seedKey: MealTypeSeedKey | null; name: string | null };
}): string {
  const params = { day: dayPart(date, { weekday: "short" }), mealType: mealTypeLabel(mealType) };
  return name === null ? t("stockMovement.meal", params) : t("stockMovement.namedMeal", { ...params, name });
}

// Which day the Meal panel adds to or edits, saying "this" or "next" for a
// day of the planner's weeks (spec "Planning"): "Adding to: this Friday · 30
// Oct". With no week, as off the planner, it names the date alone.
export function mealPanelLabel(date: string, week: Week, action: "adding" | "editing"): string {
  if (week === null) return t(`planner.panel.${action}On`, { day: formatMealDate(date) });
  const params = {
    weekday: dayPart(date, { weekday: "long" }),
    date: `${dayPart(date, { day: "numeric" })} ${dayPart(date, { month: "short" })}`,
  };
  return t(`planner.panel.${action}${week === "next" ? "Next" : "This"}`, params);
}

// A weekday's short name: "Mon". 1 to 7 January 2024 ran Monday to Sunday.
export function weekdayName(weekday: Weekday): string {
  return dayPart(`2024-01-0${weekday}`, { weekday: "short" });
}

// A Meal Series' days, as its Meals' "Repeats" label shows them: "Repeats
// daily" for all seven, "Repeats Mon to Fri" for three or more in a row,
// "Repeats Mon, Wed, Fri" otherwise. Weeks run Monday to Sunday, so a run
// never goes on past Sunday. `weekdays` come Monday first.
export function formatRepeats(weekdays: readonly Weekday[]): string {
  if (weekdays.length === 7) return t("planner.repeatsDaily");
  const first = weekdays[0]!;
  const last = weekdays.at(-1)!;
  if (weekdays.length >= 3 && last - first === weekdays.length - 1) {
    return t("planner.repeatsRange", { first: weekdayName(first), last: weekdayName(last) });
  }
  return t("planner.repeatsDays", { days: weekdays.map(weekdayName).join(", ") });
}
