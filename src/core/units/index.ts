// The units an Ingredient can be written in.
export const RECIPE_UNITS = ["g", "kg", "ml", "l", "tsp", "tbsp", "cup", "pc"] as const;

export type Unit = (typeof RECIPE_UNITS)[number];

export function parseRecipeUnit(input: unknown): Unit | null {
  return RECIPE_UNITS.find((unit) => unit === input) ?? null;
}

// The units a Product's Stock can be counted in.
export const DEFAULT_UNITS = ["g", "ml", "pc"] as const;

export type DefaultUnit = (typeof DEFAULT_UNITS)[number];

export function parseDefaultUnit(input: unknown): DefaultUnit | null {
  return DEFAULT_UNITS.find((unit) => unit === input) ?? null;
}

export type Dimension = "mass" | "volume" | "count";

export interface ConvertibleProduct {
  defaultUnit: DefaultUnit;
  // Grams per millilitre.
  density: number | null;
}

export type ConversionError =
  | { code: "noDensity" }
  | { code: "countMismatch"; from: Dimension; to: Dimension };

export type ConversionResult =
  | { ok: true; amount: number }
  | { ok: false; error: ConversionError };

// Each unit's dimension, and how many of that dimension's Default Unit
// (g, ml or pc) one of it holds.
const UNITS: Record<Unit, { dimension: Dimension; factor: number }> = {
  g: { dimension: "mass", factor: 1 },
  kg: { dimension: "mass", factor: 1000 },
  ml: { dimension: "volume", factor: 1 },
  l: { dimension: "volume", factor: 1000 },
  tsp: { dimension: "volume", factor: 5 },
  tbsp: { dimension: "volume", factor: 15 },
  cup: { dimension: "volume", factor: 250 },
  pc: { dimension: "count", factor: 1 },
};

// Drops binary float noise (1.005 * 1000 = 1004.9999999999999) while keeping
// far more precision than any kitchen amount needs. Callers still round to
// 2 decimals when writing (data-model Q2).
function tidy(n: number): number {
  return Number(n.toPrecision(12));
}

export function convertToDefaultUnit(
  amount: number,
  unit: Unit,
  product: ConvertibleProduct,
): ConversionResult {
  const { dimension: from, factor } = UNITS[unit];
  const to = UNITS[product.defaultUnit].dimension;
  const inDefaultUnits = amount * factor;
  if (from === to) return { ok: true, amount: tidy(inDefaultUnits) };

  if (from === "count" || to === "count") {
    return { ok: false, error: { code: "countMismatch", from, to } };
  }

  const { density } = product;
  if (density == null || !(density > 0)) return { ok: false, error: { code: "noDensity" } };
  const converted = from === "mass" ? inDefaultUnits / density : inDefaultUnits * density;
  return { ok: true, amount: tidy(converted) };
}

export interface PackRounding {
  packs: number;
  needed: number;
  packedAmount: number;
}

// For the Shopping List only: how many whole packs cover `amount`. Both
// arguments are in the Product's Default Unit.
export function roundToPacks(amount: number, packSize: number): PackRounding {
  if (!(packSize > 0)) throw new RangeError(`Pack Size must be positive, got ${packSize}`);
  if (!(amount >= 0)) throw new RangeError(`Amount must not be negative, got ${amount}`);
  // Tidy before rounding up, or 2.1 / 0.7 = 3.0000000000000004 becomes 4 packs.
  const packs = Math.ceil(tidy(amount / packSize));
  return { packs, needed: amount, packedAmount: tidy(packs * packSize) };
}
