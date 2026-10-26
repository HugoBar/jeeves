"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { RecipeFieldsInput } from "@/core/recipes";
import { t } from "@/strings";
import type { RecipeFormState } from "./actions";

export function RecipeForm({
  action,
  initialValues,
  submitLabel,
  cancelHref = "/recipes",
}: {
  action: (state: RecipeFormState, formData: FormData) => Promise<RecipeFormState>;
  initialValues: RecipeFieldsInput;
  submitLabel: string;
  cancelHref?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {
    errors: [],
    values: initialValues,
  });
  const values = state.values;

  return (
    <form action={formAction} className="product-form">
      <label>
        {t("recipes.name")}
        <input name="name" defaultValue={values.name} required autoFocus />
      </label>
      <label>
        {t("recipes.portions")}
        <input name="portions" inputMode="numeric" defaultValue={values.portions} required />
      </label>
      <label>
        {t("recipes.prepTime")}
        <input name="prepTimeMinutes" inputMode="numeric" defaultValue={values.prepTimeMinutes} required />
      </label>
      <label>
        {t("recipes.sourceUrl")}
        <input name="sourceUrl" type="url" defaultValue={values.sourceUrl} />
      </label>
      <label>
        {t("recipes.steps")}
        <textarea name="steps" rows={10} defaultValue={values.steps} />
      </label>
      {state.errors.map((error) => (
        <p key={error} className="form-error">
          {t(`recipes.error.${error}`)}
        </p>
      ))}
      <div className="product-form-actions">
        <button type="submit" disabled={pending}>
          {submitLabel}
        </button>
        <Link href={cancelHref}>{t("recipes.cancel")}</Link>
      </div>
    </form>
  );
}
