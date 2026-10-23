"use client";

import { useActionState } from "react";
import type { DefaultUnit } from "@/core/units";
import { t } from "@/strings";
import type { RestockFormState } from "./restock-actions";

const initialState: RestockFormState = { error: null, value: "" };

export function RestockForm({
  action,
  unit,
}: {
  action: (state: RestockFormState, formData: FormData) => Promise<RestockFormState>;
  unit: DefaultUnit;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const label = t("restock.quantity", { unit: t(`unit.${unit}`) });
  return (
    <form action={formAction} className="restock-form">
      <input name="quantity" inputMode="decimal" aria-label={label} placeholder={label} defaultValue={state.value} required />
      <button type="submit" disabled={pending}>
        {t("restock.submit")}
      </button>
      {state.error && <p className="form-error">{t(`restock.error.${state.error}`)}</p>}
    </form>
  );
}
