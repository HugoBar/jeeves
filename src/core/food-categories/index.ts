export type CategoryNameResult = { ok: true; name: string } | { ok: false; error: "blank" };

// A name the user types for a new or edited Food Category.
export function parseCategoryName(input: string): CategoryNameResult {
  const name = input.trim();
  return name ? { ok: true, name } : { ok: false, error: "blank" };
}

// A Role describes the part food plays in a meal; a Kind, what the food is.
export type CategoryKind = "role" | "kind";

export function parseCategoryKind(input: unknown): CategoryKind | null {
  return input === "role" || input === "kind" ? input : null;
}

// Roles first, then Kinds, each alphabetical by the label the user sees.
export function sortCategories<T extends { kind: CategoryKind }>(
  categories: readonly T[],
  labelOf: (category: T) => string,
): T[] {
  return [...categories].sort(
    (a, b) =>
      (a.kind === b.kind ? 0 : a.kind === "role" ? -1 : 1) ||
      labelOf(a).localeCompare(labelOf(b), undefined, { sensitivity: "base" }),
  );
}

// Seeded on first run and stored by key; the label comes from
// the UI strings file until the user renames it.
export const SEED_CATEGORIES = [
  { seedKey: "red_meat", kind: "kind" },
  { seedKey: "white_meat", kind: "kind" },
  { seedKey: "fish", kind: "kind" },
  { seedKey: "seafood", kind: "kind" },
  { seedKey: "eggs", kind: "kind" },
  { seedKey: "dairy", kind: "kind" },
  { seedKey: "legumes", kind: "kind" },
  { seedKey: "grains", kind: "kind" },
  { seedKey: "pasta", kind: "kind" },
  { seedKey: "vegetables", kind: "kind" },
  { seedKey: "fruit", kind: "kind" },
  { seedKey: "dried_fruit_nuts", kind: "kind" },
  { seedKey: "starter", kind: "role" },
  { seedKey: "soup", kind: "role" },
  { seedKey: "salad", kind: "role" },
  { seedKey: "main_dish", kind: "role" },
  { seedKey: "side_dish", kind: "role" },
  { seedKey: "dessert", kind: "role" },
  { seedKey: "snack", kind: "role" },
  { seedKey: "drink", kind: "role" },
] as const satisfies readonly { seedKey: string; kind: CategoryKind }[];

export type CategorySeedKey = (typeof SEED_CATEGORIES)[number]["seedKey"];
