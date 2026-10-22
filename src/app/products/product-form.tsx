"use client";

import Link from "next/link";
import { useActionState } from "react";
import { DEFAULT_UNITS, type DefaultUnit } from "@/core/units";
import { t } from "@/strings";
import type { ProductFormState, ProductFormValues } from "./actions";

// A Product's Default Unit is picked when creating it; once `fixedUnit` is
// set, it is only shown.
export function ProductForm({
  action,
  initialValues,
  submitLabel,
  fixedUnit,
}: {
  action: (state: ProductFormState, formData: FormData) => Promise<ProductFormState>;
  initialValues: ProductFormValues;
  submitLabel: string;
  fixedUnit?: DefaultUnit;
}) {
  const [state, formAction, pending] = useActionState(action, {
    errors: [],
    values: initialValues,
  });
  const values = state.values;

  return (
    <form action={formAction} className="product-form">
      <label>
        {t("products.name")}
        <input name="name" defaultValue={values.name} required autoFocus />
      </label>
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
        <input name="density" inputMode="decimal" defaultValue={values.density} />
      </label>
      <label>
        {t("products.packSizeName")}
        <input name="packSizeName" defaultValue={values.packSizeName} />
      </label>
      <label>
        {fixedUnit
          ? t("products.packSizeAmount", { unit: t(`unit.${fixedUnit}`) })
          : t("products.packSizeAmountInDefaultUnit")}
        <input name="packSizeAmount" inputMode="decimal" defaultValue={values.packSizeAmount} />
      </label>
      {state.errors.map((error) => (
        <p key={error} className="form-error">
          {t(`products.error.${error}`)}
        </p>
      ))}
      <div className="product-form-actions">
        <button type="submit" disabled={pending}>
          {submitLabel}
        </button>
        <Link href="/products">{t("products.cancel")}</Link>
      </div>
    </form>
  );
}
