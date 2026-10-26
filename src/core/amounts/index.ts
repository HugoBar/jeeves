// The numeric columns decimals are stored in. The schema builds its columns
// from these, so core's limits and the database's cannot drift apart.
export interface DecimalColumn {
  precision: number;
  scale: number;
}

// Stock, quantities and Pack Sizes (data-model Q2).
export const AMOUNT_COLUMN = { precision: 10, scale: 2 } as const satisfies DecimalColumn;

// Density, in grams per millilitre, keeps 4 decimals (data-model T2): at 2,
// converting 1 litre could be off by 5 g.
export const DENSITY_COLUMN = { precision: 10, scale: 4 } as const satisfies DecimalColumn;

// Rounds to the decimals the column keeps, as core does before every write.
export function roundForColumn(value: number, column: DecimalColumn): number {
  const factor = 10 ** column.scale;
  return Math.round(value * factor) / factor;
}

// Largest value the column holds, e.g. 99,999,999.99 for numeric(10,2).
export function maxForColumn(column: DecimalColumn): number {
  return (10 ** column.precision - 1) / 10 ** column.scale;
}

// A positive number rounded as the column stores it; null if the text is not
// one, rounds to 0 or does not fit.
export function parsePositive(text: string, column: DecimalColumn): number | null {
  const value = roundForColumn(Number(text), column);
  return value > 0 && value <= maxForColumn(column) ? value : null;
}

// Zero or a positive number rounded as the column stores it; null if the text
// is blank, negative or does not fit. Blank is checked because Number("") is 0.
export function parseNonNegative(text: string, column: DecimalColumn): number | null {
  const raw = Number(text);
  if (text === "" || !(raw >= 0)) return null;
  const value = roundForColumn(raw, column);
  return value <= maxForColumn(column) ? value : null;
}

// Largest value of a Postgres `integer`, the column whole numbers such as
// Portions (data-model T4) are stored in.
const INTEGER_MAX = 2_147_483_647;

// A whole number above 0 that fits an `integer` column; null otherwise. Only
// plain digits count, since Number() also reads "2.0", "1e3" and "0x10".
export function parseWholeAboveZero(text: string): number | null {
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return value > 0 && value <= INTEGER_MAX ? value : null;
}
