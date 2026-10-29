import { AMOUNT_COLUMN, DENSITY_COLUMN, parsePositive } from "@/core/amounts";
import { convertToDefaultUnit, type DefaultUnit, type Unit } from "@/core/units";

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
  // Food Category ids.
  categoryIds: string[];
}

// Raw text from the Product form.
export interface ProductFieldsInput {
  name: string;
  density: string;
  packSizeName: string;
  packSizeAmount: string;
  // The ticked Food Category checkboxes.
  categoryIds: string[];
}

export type ProductFieldError =
  | "blankName"
  | "invalidDensity"
  | "incompletePackSize"
  | "invalidPackSizeAmount";

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
      categoryIds: [...new Set(input.categoryIds)],
    },
  };
}

// The form's text for a Product's current fields: the inverse of parseProductFields.
export function toProductFieldsInput({ name, density, packSize, categoryIds }: ProductFields): ProductFieldsInput {
  return {
    name,
    density: density?.toString() ?? "",
    packSizeName: packSize?.name ?? "",
    packSizeAmount: packSize?.amount.toString() ?? "",
    categoryIds,
  };
}

// An Ingredient using a Product, named by its Recipe, as the message for a
// refused Density change lists it.
export interface IngredientUse {
  recipeName: string;
  amount: number;
  unit: Unit;
}

// The uses that stop a Product's Density from being cleared: Ingredients
// written in the other dimension (a volume unit for a g Product, a mass unit
// for an ml Product), which convert only with it. Recipes are saved only with
// Ingredients that convert, so this is the one way one could stop converting.
export function densityBlockers(defaultUnit: DefaultUnit, uses: readonly IngredientUse[]): IngredientUse[] {
  return uses.filter((use) => {
    const converted = convertToDefaultUnit(use.amount, use.unit, { defaultUnit, density: null });
    return !converted.ok && converted.error.code === "noDensity";
  });
}
