import type { CategorySeedKey } from "@/core/food-categories";
import type { DefaultUnit } from "@/core/units";
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

const quantityFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });

// An amount in a Default Unit, as shown to the user: "1,250 g".
export function formatQuantity(amount: number, unit: DefaultUnit): string {
  return `${quantityFormat.format(amount)} ${t(`unit.${unit}`)}`;
}

// A moment as shown to the user: "Oct 23, 2026, 2:05 PM", in the time zone of
// whoever runs it.
export function formatDateTime(value: Date): string {
  return value.toLocaleString("en", { dateStyle: "medium", timeStyle: "short" });
}

// A Stock Movement's delta with its sign: "+500 g", "-1.5 pc".
export function formatDelta(delta: number, unit: DefaultUnit): string {
  return `${delta > 0 ? "+" : ""}${formatQuantity(delta, unit)}`;
}
