"use client";

import Link from "next/link";
import { useActionState } from "react";
import { DEFAULT_UNITS } from "@/core/units";
import { t } from "@/strings";
import type { ProductFormState, ProductFormValues } from "./actions";

export function ProductForm({
  action,
  initialValues,
  submitLabel,
}: {
  action: (state: ProductFormState, formData: FormData) => Promise<ProductFormState>;
  initialValues: ProductFormValues;
  submitLabel: string;
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
      <label>
        {t("products.density")}
        <input name="density" inputMode="decimal" defaultValue={values.density} />
      </label>
      <label>
        {t("products.packSizeName")}
        <input name="packSizeName" defaultValue={values.packSizeName} />
      </label>
      <label>
        {t("products.packSizeAmountInDefaultUnit")}
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
