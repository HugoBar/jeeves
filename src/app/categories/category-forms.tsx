"use client";

import { useActionState, useState } from "react";
import type { CategoryKind } from "@/core/food-categories";
import { t } from "@/strings";
import { FoodCategoryPill } from "../food-category-pill";
import { useFieldErrors } from "../form-error";
import { EditableRow } from "../list-row";
import { RemoveButton } from "../remove-button";
import {
  createCategoryAction,
  editCategoryAction,
  removeCategoryAction,
  type CategoryFormState,
} from "./actions";

const initialState: CategoryFormState = { error: null };

// The one error a category form has is on its name.
function useNameError(state: CategoryFormState) {
  return useFieldErrors(
    state.error ? [state.error] : [],
    () => "name",
    (error) => t(`categories.error.${error}`),
  );
}

export function CreateCategoryForm() {
  const [state, action, pending] = useActionState(createCategoryAction, initialState);
  const { invalid, allMessages } = useNameError(state);
  return (
    <form action={action} className="item-form">
      <input name="name" aria-label={t("categories.name")} placeholder={t("categories.name")} {...invalid("name")} />
      <KindSelect defaultValue="kind" />
      <button type="submit" className="button-primary" disabled={pending}>
        {t("categories.add")}
      </button>
      {allMessages()}
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
  const { invalid, allMessages } = useNameError(state);

  if (editing) {
    return (
      <div className="list-row-open open-row">
        <form action={action} className="item-form">
          <input name="name" aria-label={t("categories.name")} defaultValue={label} autoFocus {...invalid("name")} />
          <KindSelect defaultValue={kind} />
          <button type="submit" className="button-primary" disabled={pending}>
            {t("categories.save")}
          </button>
          <button type="button" onClick={() => setEditing(false)}>
            {t("categories.cancel")}
          </button>
          {allMessages()}
        </form>
        <RemoveButton
          action={removeCategoryAction.bind(null, id)}
          label={t("categories.remove")}
          title={t("categories.removeConfirm", { name: label })}
          body={t("categories.removeConfirmBody")}
        />
      </div>
    );
  }

  return (
    <EditableRow editLabel={t("categories.edit")} onOpen={() => setEditing(true)}>
      <span className="list-row-text">
        <FoodCategoryPill label={label} />
      </span>
    </EditableRow>
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
