// Where a Shopping List item came from: Generate, from a Shortfall, or added
// by hand (data-model T7).
export const SHOPPING_LIST_SOURCES = ["shortfall", "manual"] as const;

export type ShoppingListSource = (typeof SHOPPING_LIST_SOURCES)[number];
