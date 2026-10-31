"use client";

import Link from "next/link";
import { useActionState } from "react";
import { DEFAULT_UNITS, type DefaultUnit } from "@/core/units";
import type { IngredientUse } from "@/core/products";
import { formatList, formatQuantity, t } from "@/strings";
import { groupCategoriesByKind } from "../categories/category-groups";
import type { CategoryOption } from "../categories/category-options";
import { PRODUCT_ERROR_FIELDS } from "../field-errors";
import { useFieldErrors } from "../form-error";
import type { ProductFormState, ProductFormValues } from "./actions";

// A Product's Default Unit is picked when creating it; once `fixedUnit` is
// set, it is only shown.
export function ProductForm({
  action,
  initialValues,
  categories,
  submitLabel,
  fixedUnit,
  cancelHref = "/products",
}: {
  action: (state: ProductFormState, formData: FormData) => Promise<ProductFormState>;
  initialValues: ProductFormValues;
  categories: CategoryOption[];
  submitLabel: string;
  fixedUnit?: DefaultUnit;
  cancelHref?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {
    errors: [],
    values: initialValues,
  });
  const values = state.values;
  const { invalid, messages } = useFieldErrors(
    state.errors,
    (error) => PRODUCT_ERROR_FIELDS[error],
    (error) =>
      error === "densityInUse"
        ? densityInUseMessage(values.name, state.densityUses ?? [], fixedUnit!)
        : t(`products.error.${error}`),
  );

  return (
    <form action={formAction} className="product-form">
      <label>
        {t("products.name")}
        <input name="name" defaultValue={values.name} required autoFocus {...invalid("name")} />
      </label>
      {messages("name")}
      {fixedUnit ? (
        <p>{t("products.defaultUnitFixed", { unit: t(`unit.${fixedUnit}`) })}</p>
      ) : (
        <label>
          {t("products.defaultUnit")}
          <select name="defaultUnit" defaultValue={values.defaultUnit || DEFAULT_UNITS[0]}>
            {DEFAULT_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {t(`unit.${unit}`)}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        {t("products.density")}
        <input name="density" inputMode="decimal" defaultValue={values.density} {...invalid("density")} />
      </label>
      {messages("density")}
      <label>
        {t("products.packSizeName")}
        <input name="packSizeName" defaultValue={values.packSizeName} {...invalid("packSizeName")} />
      </label>
      {messages("packSizeName")}
      <label>
        {fixedUnit
          ? t("products.packSizeAmount", { unit: t(`unit.${fixedUnit}`) })
          : t("products.packSizeAmountInDefaultUnit")}
        <input name="packSizeAmount" inputMode="decimal" defaultValue={values.packSizeAmount} {...invalid("packSizeAmount")} />
      </label>
      {messages("packSizeAmount")}
      <fieldset className="category-picker">
        <legend>{t("products.foodCategories")}</legend>
        {groupCategoriesByKind(categories).map((group) => (
          <div key={group.kind}>
            <h2>{group.heading}</h2>
            {group.categories.map((category) => (
              <label key={category.id}>
                <input
                  type="checkbox"
                  name="categoryIds"
                  value={category.id}
                  defaultChecked={values.categoryIds.includes(category.id)}
                />
                {category.label}
              </label>
            ))}
          </div>
        ))}
      </fieldset>
      <div className="product-form-actions">
        <button type="submit" className="button-primary" disabled={pending}>
          {submitLabel}
        </button>
        <Link href={cancelHref} className="button">
          {t("products.cancel")}
        </Link>
      </div>
    </form>
  );
}

// "Flour's Density is used by Pancakes (1 cup) and Bread (2 cup). ..." Only
// editing raises it, and editing always fixes the Default Unit.
function densityInUseMessage(product: string, uses: IngredientUse[], unit: DefaultUnit): string {
  return t("products.error.densityInUse", {
    product,
    uses: formatList(
      uses.map(({ recipeName, amount, unit }) =>
        t("products.densityUse", { recipe: recipeName, quantity: formatQuantity(amount, unit) }),
      ),
    ),
    unit: t(`unit.${unit}`),
  });
}
