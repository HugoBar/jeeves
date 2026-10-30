import type { CategorySeedKey } from "@/core/food-categories";
import type { MealTypeSeedKey } from "@/core/meal-types";
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

const listFormat = new Intl.ListFormat("en", { type: "conjunction" });

// Items as a sentence lists them: "a and b", "a, b, and c".
export function formatList(items: readonly string[]): string {
  return listFormat.format(items);
}

// A moment as shown to the user: "23 Oct 2026, 14:05", in the time zone of
// whoever runs it.
export function formatDateTime(value: Date): string {
  return value.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
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

// Which day a Meal form edits, saying "next" for a day of next week (spec
// "Planning"). With no week, as off the planner, it names the date.
export function editingLabel(date: string, week: "this" | "next" | null): string {
  if (week === null) return t("planner.editing", { day: formatMealDate(date) });
  const day = dayPart(date, { weekday: "long" });
  return t(week === "next" ? "planner.editingNext" : "planner.editing", { day });
}
