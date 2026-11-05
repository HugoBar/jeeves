"use client";

import Link from "next/link";
import { Fragment, useActionState, useEffect, useId, useRef, useState } from "react";
import type { IngredientError, IngredientInput } from "@/core/ingredients";
import { deriveFoodCategoryIds } from "@/core/recipes";
import { RECIPE_UNITS, type DefaultUnit } from "@/core/units";
import { t } from "@/strings";
import type { CategoryOption } from "../categories/category-options";
import { ingredientErrorField, ingredientField, RECIPE_ERROR_FIELDS } from "../field-errors";
import { FormCard } from "../form-card";
import { FormBanner, useFieldErrors, type InvalidProps } from "../form-error";
import { StepIcon, stepPortions } from "../stepper";
import type { RecipeFormState, RecipeFormValues } from "./actions";
import { CategoryChips } from "./category-chips";

// A Product the Ingredient picker offers. An Archived one is offered only in
// the rows that already hold it.
export interface ProductOption {
  id: string;
  name: string;
  defaultUnit: DefaultUnit;
  archived: boolean;
  categoryIds: string[];
}

type RecipeFormContent = {
  products: ProductOption[];
  categories: CategoryOption[];
  submitLabel: string;
  editing?: boolean;
  cancelHref?: string;
};

// New Recipe and Edit Recipe.
export function RecipeForm({
  action,
  initialValues,
  ...content
}: RecipeFormContent & {
  action: (state: RecipeFormState, formData: FormData) => Promise<RecipeFormState>;
  initialValues: RecipeFormValues;
}) {
  const [state, formAction, pending] = useActionState(action, {
    errors: [],
    ingredientErrors: [],
    values: initialValues,
  });
  return (
    // The server checks every field, so its messages show in place of the
    // browser's, such as for a Source that isn't a web address.
    <form action={formAction} className="form-cards" noValidate>
      <RecipeFormFields state={state} pending={pending} {...content} />
    </form>
  );
}

export function RecipeFormFields({
  state,
  pending,
  products,
  categories,
  submitLabel,
  editing = false,
  cancelHref = "/recipes",
}: RecipeFormContent & { state: RecipeFormState; pending: boolean }) {
  const { values, errors } = state;
  const ingredients = useIngredientRows(state, products);
  const { invalid, messages } = useFieldErrors(
    errors,
    (error) => RECIPE_ERROR_FIELDS[error],
    (error) => t(`recipes.error.${error}`),
  );
  const shownErrorCount = errors.length + ingredients.shownErrorCount;
  // The Food Categories follow the Ingredients as they are edited.
  const categoryIdsOf = new Map(products.map((product) => [product.id, product.categoryIds]));
  const derivedIds = deriveFoodCategoryIds(
    ingredients.rows.map((row) => ({ minor: row.minor, categoryIds: categoryIdsOf.get(row.productId) ?? [] })),
  );

  // The save button is below the fields, so a rejected save scrolls back up.
  const banner = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.errors.length + state.ingredientErrors.length > 0) banner.current?.scrollIntoView({ block: "center" });
  }, [state]);

  return (
    <>
      {shownErrorCount > 0 && (
        <FormBanner ref={banner}>
          <FixMessage count={shownErrorCount} editing={editing} />
        </FormBanner>
      )}
      <div className="recipe-form-columns">
        <div className="recipe-form-column">
          <FormCard title={t("recipes.basics")}>
            <div className="form-field">
              <label>
                {t("recipes.name")}
                <input
                  name="name"
                  defaultValue={values.name}
                  placeholder={t("recipes.namePlaceholder")}
                  autoFocus={!editing}
                  {...invalid("name")}
                />
              </label>
              {messages("name")}
            </div>
            <div className="recipe-form-numbers">
              <div className="form-field">
                <PortionsStepper defaultValue={values.portions} invalid={invalid("portions")} />
                {messages("portions")}
              </div>
              <div className="form-field">
                <label>
                  {t("recipes.prepTime")}
                  <span className="field-joined">
                    <input
                      name="prepTimeMinutes"
                      inputMode="numeric"
                      defaultValue={values.prepTimeMinutes}
                      {...invalid("prepTime")}
                    />
                    <span className="field-unit">{t("recipes.prepTimeUnit")}</span>
                  </span>
                </label>
                {messages("prepTime")}
              </div>
            </div>
            <div className="form-field">
              <label>
                <span>
                  {t("recipes.sourceUrl")}
                  <span className="desktop-only">{t("recipes.sourceOptional")}</span>
                </span>
                <span className="field-hint phone-only">{t("recipes.sourceHint")}</span>
                <input name="sourceUrl" type="url" defaultValue={values.sourceUrl} {...invalid("sourceUrl")} />
              </label>
              {messages("sourceUrl")}
            </div>
          </FormCard>
          <IngredientRows state={state} products={products} ingredients={ingredients} />
        </div>
        <div className="recipe-form-column">
          <FormCard title={t("recipes.steps")}>
            <div className="form-field">
              <textarea name="steps" rows={10} aria-label={t("recipes.steps")} defaultValue={values.steps} />
              <p className="field-hint">{t("recipes.stepsHint")}</p>
            </div>
          </FormCard>
          <CategoryChips state={state} derivedIds={derivedIds} categories={categories} />
        </div>
      </div>
      <div className="form-actions">
        <Link href={cancelHref} className="button">
          {t("recipes.cancel")}
        </Link>
        <button type="submit" className="button-primary" disabled={pending}>
          {submitLabel}
        </button>
      </div>
    </>
  );
}

// Portions, with - and + beside it. The field stays uncontrolled, so React
// puts it back to what was sent after a rejected save.
function PortionsStepper({ defaultValue, invalid }: { defaultValue: string; invalid: InvalidProps }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const step = (by: number) => {
    if (!input.current) return;
    input.current.value = stepPortions(input.current.value, by);
  };
  return (
    <>
      <label htmlFor={id}>{t("recipes.portions")}</label>
      <span className="field-joined recipe-stepper">
        <button type="button" aria-label={t("recipes.portionsLess")} onClick={() => step(-1)}>
          <StepIcon step="less" />
        </button>
        <input ref={input} id={id} name="portions" inputMode="numeric" defaultValue={defaultValue} {...invalid} />
        <button type="button" aria-label={t("recipes.portionsMore")} onClick={() => step(1)}>
          <StepIcon step="more" />
        </button>
      </span>
    </>
  );
}

// "Fix 7 things to add this Recipe. They're marked in red below."
function FixMessage({ count, editing }: { count: number; editing: boolean }) {
  return count === 1 ? (
    <>
      <strong>{t(editing ? "recipes.fixToSaveOne" : "recipes.fixToAddOne")}</strong> {t("recipes.fixWhereOne")}
    </>
  ) : (
    <>
      <strong>{t(editing ? "recipes.fixToSave" : "recipes.fixToAdd", { count })}</strong> {t("recipes.fixWhere")}
    </>
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
// submit.
function useIngredientRows(state: RecipeFormState, products: ProductOption[]) {
  const [rows, setRows] = useState(() => toRows(state.values.ingredients));
  const [shownState, setShownState] = useState(state);
  if (shownState !== state) {
    setShownState(state);
    setRows(toRows(state.values.ingredients));
  }

  const change = (key: string, changes: Partial<IngredientInput>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...changes } : row)));
  return {
    rows,
    // A removed row takes its errors with it, so the banner counts only those
    // still shown.
    shownErrorCount: state.ingredientErrors.filter((error) => rows.some((row) => row.submittedRow === error.row))
      .length,
    change,
    // A picked Product's unit starts as its Default Unit.
    pickProduct: (key: string, productId: string) => {
      const unit = products.find((product) => product.id === productId)?.defaultUnit;
      change(key, unit ? { productId, unit } : { productId });
    },
    add: () =>
      setRows((current) => [
        ...current,
        ...toRows([{ productId: "", amount: "", unit: "g", minor: false }]).map((row) => ({
          ...row,
          submittedRow: null,
        })),
      ]),
    remove: (key: string) => setRows((current) => current.filter((row) => row.key !== key)),
  };
}

const ROW_FIELDS = ["product", "amount", "unit"] as const;

// The Product and Unit pickers are uncontrolled: React resets the form after a
// submit, which would put a controlled select back to its first option, but
// puts an uncontrolled one back to the value it mounted with. Refilled rows get
// new keys, so they mount with what was sent.
function IngredientRows({
  state,
  products,
  ingredients: { rows, change, pickProduct, add, remove },
}: {
  state: RecipeFormState;
  products: ProductOption[];
  ingredients: ReturnType<typeof useIngredientRows>;
}) {
  const { invalid, messages } = useFieldErrors(state.ingredientErrors, ingredientErrorField, ingredientErrorMessage);

  return (
    <FormCard title={t("recipes.ingredients")} hint={t("recipes.ingredientsHint")} className="recipe-ingredients">
      <div className="ingredient-rows">
        {rows.length > 0 && (
          <div className="ingredient-head desktop-only" aria-hidden="true">
            <span>{t("recipes.ingredientProduct")}</span>
            <span>{t("recipes.ingredientAmount")}</span>
            <span>{t("recipes.ingredientUnit")}</span>
            <span>{t("recipes.ingredientMinor")}</span>
          </div>
        )}
        {rows.map((row, index) => {
          const field = (name: (typeof ROW_FIELDS)[number]) => ingredientField(row.submittedRow, name);
          const rowMessages = ROW_FIELDS.flatMap((name) => {
            const shown = messages(field(name));
            return shown ? [<Fragment key={name}>{shown}</Fragment>] : [];
          });
          return (
            <div key={row.key} className={rowMessages.length > 0 ? "ingredient-row ingredient-row-invalid" : "ingredient-row"}>
              <select
                name="ingredientProductId"
                className="ingredient-product"
                aria-label={t("recipes.ingredientProduct")}
                defaultValue={row.productId}
                onChange={(event) => pickProduct(row.key, event.target.value)}
                {...invalid(field("product"))}
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
                className="ingredient-amount"
                aria-label={t("recipes.ingredientAmount")}
                inputMode="decimal"
                value={row.amount}
                onChange={(event) => change(row.key, { amount: event.target.value })}
                {...invalid(field("amount"))}
              />
              {/* Remounted when the Product changes, to start at its Default Unit. */}
              <select
                key={row.productId}
                name="ingredientUnit"
                className="ingredient-unit"
                aria-label={t("recipes.ingredientUnit")}
                defaultValue={row.unit}
                onChange={(event) => change(row.key, { unit: event.target.value })}
                {...invalid(field("unit"))}
              >
                {RECIPE_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {t(`unit.${unit}`)}
                  </option>
                ))}
              </select>
              <label className="ingredient-minor">
                <input
                  type="checkbox"
                  name="ingredientMinor"
                  value={index}
                  checked={row.minor}
                  onChange={(event) => change(row.key, { minor: event.target.checked })}
                />
                <span>{t("recipes.ingredientMinor")}</span>
              </label>
              <button
                type="button"
                className="ingredient-remove"
                aria-label={t("recipes.ingredientRemove", { row: index + 1 })}
                onClick={() => remove(row.key)}
              >
                <CrossIcon />
              </button>
              {rowMessages.length > 0 && <div className="ingredient-errors">{rowMessages}</div>}
            </div>
          );
        })}
      </div>
      <button type="button" className="button-list-add" onClick={add}>
        {t("recipes.ingredientAdd")}
      </button>
      <p className="field-hint recipe-minor-form-note">{t("recipes.minorFormNote")}</p>
    </FormCard>
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

function CrossIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
