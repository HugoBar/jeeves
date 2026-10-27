"use client";

import { useActionState, useState } from "react";
import { t } from "@/strings";
import { editMealTypeAction, type MealTypeFormState } from "./actions";

const initialState: MealTypeFormState = { errors: [] };

// A Meal Type as listed, edited in place.
export function MealTypeRow({
  id,
  label,
  priority,
  allowsLeftovers,
}: {
  id: string;
  label: string;
  priority: number;
  allowsLeftovers: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(
    async (previous: MealTypeFormState, formData: FormData) => {
      const next = await editMealTypeAction(id, previous, formData);
      if (next.errors.length === 0) setEditing(false);
      return next;
    },
    initialState,
  );

  if (editing) {
    return (
      <form action={action} className="item-form">
        <input name="name" aria-label={t("mealTypes.name")} defaultValue={label} autoFocus />
        <label>
          {t("mealTypes.priority")}
          <input name="priority" inputMode="numeric" defaultValue={priority} />
        </label>
        <label>
          <input type="checkbox" name="allowsLeftovers" defaultChecked={allowsLeftovers} />
          {t("mealTypes.allowsLeftovers")}
        </label>
        <button type="submit" disabled={pending}>
          {t("mealTypes.save")}
        </button>
        <button type="button" onClick={() => setEditing(false)}>
          {t("mealTypes.cancel")}
        </button>
        {state.errors.map((error) => (
          <p key={error} className="form-error">
            {t(`mealTypes.error.${error}`)}
          </p>
        ))}
      </form>
    );
  }

  return (
    <div className="item-row">
      <span>{label}</span>
      <span>{t("mealTypes.priorityTag", { priority })}</span>
      {allowsLeftovers && <span>{t("mealTypes.leftoversTag")}</span>}
      <button type="button" onClick={() => setEditing(true)}>
        {t("mealTypes.edit")}
      </button>
    </div>
  );
}
