// What caused a Stock Movement (glossary: Stock Movement).
export const STOCK_MOVEMENT_TYPES = ["restock", "discard", "correction", "confirmation", "reopen"] as const;

export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];
