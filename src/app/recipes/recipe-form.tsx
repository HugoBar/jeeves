"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { IngredientError, IngredientInput } from "@/core/ingredients";
import { CATEGORY_OVERRIDE_MODES } from "@/core/recipes";
import { RECIPE_UNITS, type DefaultUnit } from "@/core/units";
import { t } from "@/strings";
import { groupCategoriesByKind } from "../categories/category-groups";
import type { CategoryOption } from "../categories/category-options";
import { ingredientErrorField, ingredientField, RECIPE_ERROR_FIELDS } from "../field-errors";
import { useFieldErrors } from "../form-error";
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
  categories,
  submitLabel,
  cancelHref = "/recipes",
}: {
  action: (state: RecipeFormState, formData: FormData) => Promise<RecipeFormState>;
  initialValues: RecipeFormValues;
  products: ProductOption[];
  categories: CategoryOption[];
  submitLabel: string;
  cancelHref?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {
    errors: [],
    ingredientErrors: [],
    values: initialValues,
  });
  const values = state.values;
  const { invalid, messages } = useFieldErrors(
    state.errors,
    (error) => RECIPE_ERROR_FIELDS[error],
    (error) => t(`recipes.error.${error}`),
  );

  return (
    <form action={formAction} className="product-form">
      <label>
        {t("recipes.name")}
        <input name="name" defaultValue={values.name} required autoFocus {...invalid("name")} />
      </label>
      {messages("name")}
      <label>
        {t("recipes.portions")}
        <input name="portions" inputMode="numeric" defaultValue={values.portions} required {...invalid("portions")} />
      </label>
      {messages("portions")}
      <label>
        {t("recipes.prepTime")}
        <input
          name="prepTimeMinutes"
          inputMode="numeric"
          defaultValue={values.prepTimeMinutes}
          required
          {...invalid("prepTime")}
        />
      </label>
      {messages("prepTime")}
      <label>
        {t("recipes.sourceUrl")}
        <input name="sourceUrl" type="url" defaultValue={values.sourceUrl} {...invalid("sourceUrl")} />
      </label>
      {messages("sourceUrl")}
      <IngredientRows state={state} products={products} />
      <fieldset className="category-picker">
        <legend>{t("recipes.categoryOverrides")}</legend>
        <p>{t("recipes.categoryOverridesHint")}</p>
        {groupCategoriesByKind(categories).map((group) => (
          <div key={group.kind}>
            <h2>{group.heading}</h2>
            {group.categories.map((category) => (
              <label key={category.id}>
                <input type="hidden" name="overrideCategoryId" value={category.id} />
                {category.label}
                <select
                  name="overrideMode"
                  defaultValue={values.categoryOverrides.find((o) => o.categoryId === category.id)?.mode ?? ""}
                >
                  <option value="">{t("recipes.categoryOverride.follow")}</option>
                  {CATEGORY_OVERRIDE_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {t(`recipes.categoryOverride.${mode}`)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        ))}
      </fieldset>
      <label>
        {t("recipes.steps")}
        <textarea name="steps" rows={10} defaultValue={values.steps} />
      </label>
      <div className="product-form-actions">
        <button type="submit" className="button-primary" disabled={pending}>
          {submitLabel}
        </button>
        <Link href={cancelHref} className="button">
          {t("recipes.cancel")}
        </Link>
      </div>
    </form>
  );
}

// `submittedRow` is the row's number in the last submit, which its errors use,
// so they stay with it when rows are removed. Null for a row added since.
type Row = IngredientInput & { key: string; submittedRow: number | null };

// Every row gets a fresh key from this counter, including those refilled from
// a submit.
let nextRowKey = 0;

function toRows(inputs: IngredientInput[]): Row[] {
  return inputs.map((input, index) => ({ ...input, key: String(nextRowKey++), submittedRow: index + 1 }));
}

// The Ingredient rows, in the order entered, refilled from `state` after each
// submit. The Product and Unit pickers are uncontrolled: React resets the form
// after a submit, which would put a controlled select back to its first option,
// but puts an uncontrolled one back to the value it mounted with. Refilled rows
// get new keys, so they mount with what was sent.
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
    setRows((current) => [
      ...current,
      ...toRows([{ productId: "", amount: "", unit: "g", minor: false }]).map((row) => ({ ...row, submittedRow: null })),
    ]);
  const remove = (key: string) => setRows((current) => current.filter((row) => row.key !== key));
  const { invalid, messages } = useFieldErrors(state.ingredientErrors, ingredientErrorField, ingredientErrorMessage);

  return (
    <fieldset className="ingredient-rows">
      <legend>{t("recipes.ingredients")}</legend>
      {rows.map((row, index) => (
        <div key={row.key} className="ingredient-row">
          <span>{t("recipes.ingredientNumber", { row: index + 1 })}</span>
          <select
            name="ingredientProductId"
            aria-label={t("recipes.ingredientProduct")}
            defaultValue={row.productId}
            onChange={(event) => pickProduct(row.key, event.target.value)}
            {...invalid(ingredientField(row.submittedRow, "product"))}
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
          <span className="field-joined">
            <input
              name="ingredientAmount"
              aria-label={t("recipes.ingredientAmount")}
              inputMode="decimal"
              value={row.amount}
              onChange={(event) => change(row.key, { amount: event.target.value })}
              {...invalid(ingredientField(row.submittedRow, "amount"))}
            />
            {/* Remounted when the Product changes, to start at its Default Unit. */}
            <select
              key={row.productId}
              name="ingredientUnit"
              aria-label={t("recipes.ingredientUnit")}
              defaultValue={row.unit}
              onChange={(event) => change(row.key, { unit: event.target.value })}
              {...invalid(ingredientField(row.submittedRow, "unit"))}
            >
              {RECIPE_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {t(`unit.${unit}`)}
                </option>
              ))}
            </select>
          </span>
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
          <button type="button" className="button-danger" onClick={() => remove(row.key)}>
            {t("recipes.ingredientRemove")}
          </button>
          {messages(ingredientField(row.submittedRow, "product"))}
          {messages(ingredientField(row.submittedRow, "amount"))}
          {messages(ingredientField(row.submittedRow, "unit"))}
        </div>
      ))}
      <button type="button" className="button-list-add" onClick={add}>
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
