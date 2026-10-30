"use client";

import { useActionState } from "react";
import type { StockMovementType } from "@/core/stock";
import type { DefaultUnit } from "@/core/units";
import { t } from "@/strings";
import { useFieldErrors } from "../form-error";
import type { StockFormState } from "./stock-actions";

const initialState: StockFormState = { error: null, value: "" };

// One quantity field and a button, for a Restock, Discard or Correction.
export function StockForm({
  kind,
  action,
  unit,
}: {
  kind: Extract<StockMovementType, "restock" | "discard" | "correction">;
  action: (state: StockFormState, formData: FormData) => Promise<StockFormState>;
  unit: DefaultUnit;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const label = t(`${kind}.quantity`, { unit: t(`unit.${unit}`) });
  const { invalid, allMessages } = useFieldErrors(
    state.error ? [state.error] : [],
    () => "quantity",
    (error) => t(`quantity.error.${error}`),
  );
  return (
    <form action={formAction} className="stock-form">
      <input
        name="quantity"
        inputMode="decimal"
        aria-label={label}
        placeholder={label}
        defaultValue={state.value}
        required
        {...invalid("quantity")}
      />
      <button type="submit" className="button-primary" disabled={pending}>
        {t(`${kind}.submit`)}
      </button>
      {allMessages()}
    </form>
  );
}
