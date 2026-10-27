import { AMOUNT_COLUMN, parsePositive } from "@/core/amounts";
import {
  convertToDefaultUnit,
  parseRecipeUnit,
  type ConvertibleProduct,
  type DefaultUnit,
  type Unit,
} from "@/core/units";

// One of a Recipe's Ingredients. A Recipe's Ingredients are kept in the
// order entered.
export interface Ingredient {
  productId: string;
  // In `unit`.
  amount: number;
  unit: Unit;
  minor: boolean;
}

// Raw values from one Ingredient row of the Recipe form.
export interface IngredientInput {
  productId: string;
  amount: string;
  unit: string;
  minor: boolean;
}

// A Product an Ingredient can use.
export interface PickableProduct extends ConvertibleProduct {
  name: string;
}

// `row` counts from 1, as the form shows the rows. `product` is the
// Ingredient's Product name, which names the Ingredient in the error.
export type IngredientError = { row: number } & (
  | { code: "noProduct" | "unavailableProduct" }
  | { code: "invalidAmount"; product: string }
  | { code: "noDensity" | "countMismatch"; product: string; unit: Unit; defaultUnit: DefaultUnit }
);

export type IngredientsResult =
  | { ok: true; ingredients: Ingredient[] }
  | { ok: false; errors: IngredientError[] };

// A Recipe can't be saved with an Ingredient whose unit can't convert to its
// Product's Default Unit (spec "Units"), so every one is checked up front.
// `products` holds the Products that can be picked; a row left blank is
// skipped.
export function parseIngredients(
  inputs: IngredientInput[],
  products: ReadonlyMap<string, PickableProduct>,
): IngredientsResult {
  const ingredients: Ingredient[] = [];
  const errors: IngredientError[] = [];
  inputs.forEach((input, index) => {
    const row = index + 1;
    const amountText = input.amount.trim();
    if (!input.productId && !amountText) return;
    if (!input.productId) {
      errors.push({ row, code: "noProduct" });
      return;
    }
    const product = products.get(input.productId);
    if (!product) {
      errors.push({ row, code: "unavailableProduct" });
      return;
    }
    // The form only offers the Recipe units, so anything else is a crafted request.
    const unit = parseRecipeUnit(input.unit);
    if (!unit) throw new RangeError(`Not a Recipe unit: ${input.unit}`);
    const amount = parsePositive(amountText, AMOUNT_COLUMN);
    if (amount === null) {
      errors.push({ row, code: "invalidAmount", product: product.name });
      return;
    }
    const conversion = convertToDefaultUnit(amount, unit, product);
    if (!conversion.ok) {
      errors.push({ row, code: conversion.error.code, product: product.name, unit, defaultUnit: product.defaultUnit });
      return;
    }
    ingredients.push({ productId: input.productId, amount, unit, minor: input.minor });
  });
  return errors.length ? { ok: false, errors } : { ok: true, ingredients };
}

// The form's row for an Ingredient: the inverse of parseIngredients.
export function toIngredientInput({ productId, amount, unit, minor }: Ingredient): IngredientInput {
  return { productId, amount: amount.toString(), unit, minor };
}
