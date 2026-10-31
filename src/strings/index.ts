import type { CategorySeedKey } from "@/core/food-categories";
import type { MealTypeSeedKey } from "@/core/meal-types";
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

// A Pack Size in a sentence: "Pack Size is a 1,000 g bag." The amount is
// spoken right after the article, so eight and eleven take "an". A capital
// starting a word is dropped, but "XL bag" keeps its letters.
export function formatPackSizeNote({ name, amount }: PackSize, unit: DefaultUnit): string {
  const quantity = formatQuantity(amount, unit);
  return t(/^(8|1[18](,\d{3})*(\.| ))/.test(quantity) ? "products.packSizeNoteAn" : "products.packSizeNote", {
    quantity,
    name: name.replace(/^\p{Lu}(?!\p{Lu})/u, (capital) => capital.toLowerCase()),
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

// A week's dates for its planner header: "19-25 Oct", or "26 Oct-1 Nov" when
// it runs into the next month.
export function formatWeekRange(first: string, last: string): string {
  const day = (date: string) => dayPart(date, { day: "numeric" });
  const month = (date: string) => dayPart(date, { month: "short" });
  return month(first) === month(last)
    ? `${day(first)}-${day(last)} ${month(last)}`
    : `${day(first)} ${month(first)}-${day(last)} ${month(last)}`;
}

// A planner day's heading: "Sun 1".
export function formatDayHeading(date: string): string {
  return `${dayPart(date, { weekday: "short" })} ${dayPart(date, { day: "numeric" })}`;
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

// Which day a Meal form edits, saying "next" for a day of next week (spec
// "Planning"). With no week, as off the planner, it names the date.
export function editingLabel(date: string, week: "this" | "next" | null): string {
  if (week === null) return t("planner.editing", { day: formatMealDate(date) });
  const day = dayPart(date, { weekday: "long" });
  return t(week === "next" ? "planner.editingNext" : "planner.editing", { day });
}
