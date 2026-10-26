"use client";

import { useActionState, useState } from "react";
import type { CategoryKind } from "@/core/food-categories";
import { t } from "@/strings";
import { RemoveButton } from "../remove-button";
import {
  createCategoryAction,
  editCategoryAction,
  removeCategoryAction,
  type CategoryFormState,
} from "./actions";

const initialState: CategoryFormState = { error: null };

export function CreateCategoryForm() {
  const [state, action, pending] = useActionState(createCategoryAction, initialState);
  return (
    <form action={action} className="category-form">
      <input name="name" aria-label={t("categories.name")} placeholder={t("categories.name")} />
      <KindSelect defaultValue="kind" />
      <button type="submit" disabled={pending}>
        {t("categories.add")}
      </button>
      <FormError state={state} />
    </form>
  );
}

export function CategoryRow({ id, label, kind }: { id: string; label: string; kind: CategoryKind }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(
    async (previous: CategoryFormState, formData: FormData) => {
      const next = await editCategoryAction(id, previous, formData);
      if (!next.error) setEditing(false);
      return next;
    },
    initialState,
  );

  if (editing) {
    return (
      <form action={action} className="category-form">
        <input name="name" aria-label={t("categories.name")} defaultValue={label} autoFocus />
        <KindSelect defaultValue={kind} />
        <button type="submit" disabled={pending}>
          {t("categories.save")}
        </button>
        <button type="button" onClick={() => setEditing(false)}>
          {t("categories.cancel")}
        </button>
        <FormError state={state} />
      </form>
    );
  }

  return (
    <div className="category-row">
      <span>{label}</span>
      <button type="button" onClick={() => setEditing(true)}>
        {t("categories.edit")}
      </button>
      <RemoveButton
        action={removeCategoryAction.bind(null, id)}
        label={t("categories.remove")}
        confirmMessage={t("categories.removeConfirm", { name: label })}
      />
    </div>
  );
}

function KindSelect({ defaultValue }: { defaultValue: CategoryKind }) {
  return (
    <select name="kind" aria-label={t("categories.type")} defaultValue={defaultValue}>
      <option value="kind">{t("categories.kind")}</option>
      <option value="role">{t("categories.role")}</option>
    </select>
  );
}

function FormError({ state }: { state: CategoryFormState }) {
  return state.error && <p className="form-error">{t("categories.error.blank")}</p>;
}
