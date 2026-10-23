import type { CategoryKind } from "@/core/food-categories";
import { t } from "@/strings";

// Food Categories as listed and picked: Roles first, then Kinds, each under
// its heading. Categories keep the order they are given in.
export function groupCategoriesByKind<T extends { kind: CategoryKind }>(
  categories: readonly T[],
): { kind: CategoryKind; heading: string; categories: T[] }[] {
  return [
    { kind: "role" as const, heading: t("categories.roles") },
    { kind: "kind" as const, heading: t("categories.kinds") },
  ].map((group) => ({ ...group, categories: categories.filter((category) => category.kind === group.kind) }));
}
