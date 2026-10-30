"use client";

import { useActionState, useState } from "react";
import { t } from "@/strings";
import { MEAL_TYPE_ERROR_FIELDS } from "../field-errors";
import { useFieldErrors, type InvalidProps } from "../form-error";
import { RemoveButton } from "../remove-button";
import {
  createMealTypeAction,
  editMealTypeAction,
  removeMealTypeAction,
  type MealTypeFormState,
} from "./actions";

const initialState: MealTypeFormState = { errors: [] };

function useMealTypeErrors(state: MealTypeFormState) {
  return useFieldErrors(
    state.errors,
    (error) => MEAL_TYPE_ERROR_FIELDS[error],
    (error) => t(`mealTypes.error.${error}`),
  );
}

export function CreateMealTypeForm() {
  const [state, action, pending] = useActionState(createMealTypeAction, initialState);
  const { invalid, allMessages } = useMealTypeErrors(state);
  return (
    <form action={action} className="item-form">
      <input name="name" aria-label={t("mealTypes.name")} placeholder={t("mealTypes.name")} {...invalid("name")} />
      <MealTypeFields priority="" allowsLeftovers={false} priorityInvalidProps={invalid("priority")} />
      <button type="submit" className="button-primary" disabled={pending}>
        {t("mealTypes.add")}
      </button>
      {allMessages()}
    </form>
  );
}

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
  const { invalid, allMessages } = useMealTypeErrors(state);

  if (editing) {
    return (
      <form action={action} className="item-form open-row">
        <input name="name" aria-label={t("mealTypes.name")} defaultValue={label} autoFocus {...invalid("name")} />
        <MealTypeFields
          priority={String(priority)}
          allowsLeftovers={allowsLeftovers}
          priorityInvalidProps={invalid("priority")}
        />
        <button type="submit" className="button-primary" disabled={pending}>
          {t("mealTypes.save")}
        </button>
        <button type="button" onClick={() => setEditing(false)}>
          {t("mealTypes.cancel")}
        </button>
        {allMessages()}
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
      <RemoveButton
        action={removeMealTypeAction.bind(null, id)}
        label={t("mealTypes.remove")}
        confirmMessage={t("mealTypes.removeConfirm", { name: label })}
      />
    </div>
  );
}

// Meal Priority and "allows Leftovers", shared by both forms.
function MealTypeFields({
  priority,
  allowsLeftovers,
  priorityInvalidProps,
}: {
  priority: string;
  allowsLeftovers: boolean;
  priorityInvalidProps: InvalidProps;
}) {
  return (
    <>
      <label>
        {t("mealTypes.priority")}
        <input name="priority" inputMode="numeric" defaultValue={priority} {...priorityInvalidProps} />
      </label>
      <label>
        <input type="checkbox" name="allowsLeftovers" defaultChecked={allowsLeftovers} />
        {t("mealTypes.allowsLeftovers")}
      </label>
    </>
  );
}
