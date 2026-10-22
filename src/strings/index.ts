import type { CategorySeedKey } from "@/core/food-categories";
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
