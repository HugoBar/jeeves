"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { IngredientError, IngredientInput } from "@/core/ingredients";
import { RECIPE_UNITS, type DefaultUnit } from "@/core/units";
import { t } from "@/strings";
import type { RecipeFormState, RecipeFormValues } from "./actions";

// A Product the Ingredient picker offers. An Archived one is offered only in
// the rows that already hold it.
export interface ProductOption {
  id: string;
  name: string;
  defaultUnit: DefaultUnit;
  archived: boolean;
}

export function RecipeForm({
  action,
  initialValues,
  products,
  submitLabel,
  cancelHref = "/recipes",
}: {
  action: (state: RecipeFormState, formData: FormData) => Promise<RecipeFormState>;
  initialValues: RecipeFormValues;
  products: ProductOption[];
  submitLabel: string;
  cancelHref?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {
    errors: [],
    ingredientErrors: [],
    values: initialValues,
  });
  const values = state.values;

  return (
    <form action={formAction} className="product-form">
      <label>
        {t("recipes.name")}
        <input name="name" defaultValue={values.name} required autoFocus />
      </label>
      <label>
        {t("recipes.portions")}
        <input name="portions" inputMode="numeric" defaultValue={values.portions} required />
      </label>
      <label>
        {t("recipes.prepTime")}
        <input name="prepTimeMinutes" inputMode="numeric" defaultValue={values.prepTimeMinutes} required />
      </label>
      <label>
        {t("recipes.sourceUrl")}
        <input name="sourceUrl" type="url" defaultValue={values.sourceUrl} />
      </label>
      <IngredientRows state={state} products={products} />
      <label>
        {t("recipes.steps")}
        <textarea name="steps" rows={10} defaultValue={values.steps} />
      </label>
      {state.errors.map((error) => (
        <p key={error} className="form-error">
          {t(`recipes.error.${error}`)}
        </p>
      ))}
      {state.ingredientErrors.map((error) => (
        <p key={`${error.row}-${error.code}`} className="form-error">
          {ingredientErrorMessage(error)}
        </p>
      ))}
      <div className="product-form-actions">
        <button type="submit" disabled={pending}>
          {submitLabel}
        </button>
        <Link href={cancelHref}>{t("recipes.cancel")}</Link>
      </div>
    </form>
  );
}

type Row = IngredientInput & { key: string };

// Rows refilled from a submit are keyed by position; added ones get a fresh
// key from this counter.
let nextRowKey = 0;

function toRows(inputs: IngredientInput[]): Row[] {
  return inputs.map((input, index) => ({ ...input, key: String(index) }));
}

// The Ingredient rows, in the order entered. They are controlled so rows can
// be added and removed, and refilled from `state` after each submit.
function IngredientRows({ state, products }: { state: RecipeFormState; products: ProductOption[] }) {
  const [rows, setRows] = useState(() => toRows(state.values.ingredients));
  const [shownState, setShownState] = useState(state);
  if (shownState !== state) {
    setShownState(state);
    setRows(toRows(state.values.ingredients));
  }

  const change = (key: string, changes: Partial<IngredientInput>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...changes } : row)));
  // A picked Product's unit starts as its Default Unit.
  const pickProduct = (key: string, productId: string) => {
    const unit = products.find((product) => product.id === productId)?.defaultUnit;
    change(key, unit ? { productId, unit } : { productId });
  };
  const add = () =>
    setRows((current) => [...current, { productId: "", amount: "", unit: "g", minor: false, key: `added-${nextRowKey++}` }]);
  const remove = (key: string) => setRows((current) => current.filter((row) => row.key !== key));

  return (
    <fieldset className="ingredient-rows">
      <legend>{t("recipes.ingredients")}</legend>
      {rows.map((row, index) => (
        <div key={row.key} className="ingredient-row">
          <span>{t("recipes.ingredientNumber", { row: index + 1 })}</span>
          <select
            name="ingredientProductId"
            aria-label={t("recipes.ingredientProduct")}
            value={row.productId}
            onChange={(event) => pickProduct(row.key, event.target.value)}
          >
            <option value="">{t("recipes.ingredientPickProduct")}</option>
            {products
              .filter((product) => !product.archived || product.id === row.productId)
              .map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
          </select>
          <input
            name="ingredientAmount"
            aria-label={t("recipes.ingredientAmount")}
            inputMode="decimal"
            value={row.amount}
            onChange={(event) => change(row.key, { amount: event.target.value })}
          />
          <select
            name="ingredientUnit"
            aria-label={t("recipes.ingredientUnit")}
            value={row.unit}
            onChange={(event) => change(row.key, { unit: event.target.value })}
          >
            {RECIPE_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {t(`unit.${unit}`)}
              </option>
            ))}
          </select>
          <label>
            <input
              type="checkbox"
              name="ingredientMinor"
              value={index}
              checked={row.minor}
              onChange={(event) => change(row.key, { minor: event.target.checked })}
            />
            {t("recipes.ingredientMinor")}
          </label>
          <button type="button" onClick={() => remove(row.key)}>
            {t("recipes.ingredientRemove")}
          </button>
        </div>
      ))}
      <button type="button" onClick={add}>
        {t("recipes.ingredientAdd")}
      </button>
    </fieldset>
  );
}

function ingredientErrorMessage(error: IngredientError): string {
  switch (error.code) {
    case "noProduct":
    case "unavailableProduct":
      return t(`recipes.error.${error.code}`, { row: error.row });
    case "invalidAmount":
      return t("recipes.error.invalidAmount", { row: error.row, product: error.product });
    case "noDensity":
    case "countMismatch":
      return t(`recipes.error.${error.code}`, {
        row: error.row,
        product: error.product,
        unit: t(`unit.${error.unit}`),
        defaultUnit: t(`unit.${error.defaultUnit}`),
      });
  }
}
