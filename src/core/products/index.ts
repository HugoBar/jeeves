import {
  AMOUNT_COLUMN,
  DENSITY_COLUMN,
  maxForColumn,
  roundForColumn,
  type DecimalColumn,
} from "@/core/amounts";

export interface PackSize {
  name: string;
  // In the Product's Default Unit.
  amount: number;
}

// What the user can set on a Product, and change later. The Default Unit is
// chosen once at creation and never changes, so it is not one of them.
export interface ProductFields {
  name: string;
  // Grams per millilitre.
  density: number | null;
  packSize: PackSize | null;
}

// Raw text from the Product form.
export interface ProductFieldsInput {
  name: string;
  density: string;
  packSizeName: string;
  packSizeAmount: string;
}

export type ProductFieldError =
  | "blankName"
  | "invalidDensity"
  | "incompletePackSize"
  | "invalidPackSizeAmount";

// A positive number rounded as the column stores it; null if the text is not
// one, rounds to 0 or does not fit.
function parsePositive(text: string, column: DecimalColumn): number | null {
  const value = roundForColumn(Number(text), column);
  return value > 0 && value <= maxForColumn(column) ? value : null;
}

export type ProductFieldsResult =
  | { ok: true; fields: ProductFields }
  | { ok: false; errors: ProductFieldError[] };

export function parseProductFields(input: ProductFieldsInput): ProductFieldsResult {
  const name = input.name.trim();
  const densityText = input.density.trim();
  const density = densityText ? parsePositive(densityText, DENSITY_COLUMN) : null;
  const packSizeName = input.packSizeName.trim();
  const packSizeAmountText = input.packSizeAmount.trim();
  const packSizeAmount = packSizeAmountText ? parsePositive(packSizeAmountText, AMOUNT_COLUMN) : null;

  const errors: ProductFieldError[] = [];
  if (!name) errors.push("blankName");
  if (densityText && density === null) errors.push("invalidDensity");
  // A Pack Size is a name and an amount together, or nothing.
  if (!packSizeName !== !packSizeAmountText) errors.push("incompletePackSize");
  else if (packSizeAmountText && packSizeAmount === null) errors.push("invalidPackSizeAmount");
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    fields: {
      name,
      density,
      packSize: packSizeAmount === null ? null : { name: packSizeName, amount: packSizeAmount },
    },
  };
}
