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
