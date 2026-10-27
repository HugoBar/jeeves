"use client";

import { useActionState, useState } from "react";
import type { MealTemplateFields } from "@/core/meal-templates";
import { t } from "@/strings";
import { RemoveButton } from "../remove-button";
import {
  createMealTemplateAction,
  editMealTemplateAction,
  removeMealTemplateAction,
  type MealTemplateFormState,
} from "./actions";

const initialState: MealTemplateFormState = { errors: [] };

// A Meal Type as the picker offers it, by the label the user sees.
export interface MealTypeOption {
  id: string;
  label: string;
}

export function CreateMealTemplateForm({ mealTypes }: { mealTypes: MealTypeOption[] }) {
  const [state, action, pending] = useActionState(createMealTemplateAction, initialState);
  return (
    <form action={action} className="item-form">
      <input name="name" aria-label={t("mealTemplates.name")} placeholder={t("mealTemplates.name")} />
      <input type="time" name="hour" aria-label={t("mealTemplates.hour")} />
      <MealTypeSelect mealTypes={mealTypes} defaultValue="" />
      <button type="submit" disabled={pending}>
        {t("mealTemplates.add")}
      </button>
      <FormErrors state={state} />
    </form>
  );
}

// A Meal Template as listed, edited in place.
export function MealTemplateRow({
  id,
  name,
  hour,
  mealTypeId,
  mealTypes,
}: MealTemplateFields & { id: string; mealTypes: MealTypeOption[] }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(
    async (previous: MealTemplateFormState, formData: FormData) => {
      const next = await editMealTemplateAction(id, previous, formData);
      if (next.errors.length === 0) setEditing(false);
      return next;
    },
    initialState,
  );

  if (editing) {
    return (
      <form action={action} className="item-form">
        <input name="name" aria-label={t("mealTemplates.name")} defaultValue={name} autoFocus />
        <input type="time" name="hour" aria-label={t("mealTemplates.hour")} defaultValue={hour} />
        <MealTypeSelect mealTypes={mealTypes} defaultValue={mealTypeId} />
        <button type="submit" disabled={pending}>
          {t("mealTemplates.save")}
        </button>
        <button type="button" onClick={() => setEditing(false)}>
          {t("mealTemplates.cancel")}
        </button>
        <FormErrors state={state} />
      </form>
    );
  }

  return (
    <div className="item-row">
      <span>{name}</span>
      <span>{hour}</span>
      <span>{mealTypes.find((mealType) => mealType.id === mealTypeId)?.label}</span>
      <button type="button" onClick={() => setEditing(true)}>
        {t("mealTemplates.edit")}
      </button>
      <RemoveButton
        action={removeMealTemplateAction.bind(null, id)}
        label={t("mealTemplates.remove")}
        confirmMessage={t("mealTemplates.removeConfirm", { name })}
      />
    </div>
  );
}

function MealTypeSelect({ mealTypes, defaultValue }: { mealTypes: MealTypeOption[]; defaultValue: string }) {
  return (
    <select name="mealTypeId" aria-label={t("mealTemplates.mealType")} defaultValue={defaultValue}>
      <option value="">{t("mealTemplates.pickMealType")}</option>
      {mealTypes.map((mealType) => (
        <option key={mealType.id} value={mealType.id}>
          {mealType.label}
        </option>
      ))}
    </select>
  );
}

function FormErrors({ state }: { state: MealTemplateFormState }) {
  return state.errors.map((error) => (
    <p key={error} className="form-error">
      {t(`mealTemplates.error.${error}`)}
    </p>
  ));
}
