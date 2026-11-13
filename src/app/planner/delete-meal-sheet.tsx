"use client";

import { useId, useState, useTransition } from "react";
import type { SeriesScope } from "@/core/meal-series";
import { formatMealDate, formatRepeats, pluralName, t } from "@/strings";
import { LockIcon } from "../form-error";
import { ConfirmSheet, Sheet } from "../sheet";
import { removeMealAction } from "./actions";
import type { PlannerMeal } from "./meal-card";

const SCOPES: readonly SeriesScope[] = ["this", "following"];

// Asks before deleting a Meal, `label` being its name or Meal Type. A Meal of
// a Meal Series asks which Meals go: only this one, picked first, leaving a
// gap that is never recreated, or it and every later Planned one, which ends
// the series (spec "Meal Series"). Cancel, Close and Escape change nothing.
// `onDeleted` runs once it is gone, before the sheet closes.
export function DeleteMealSheet({
  meal,
  label,
  onDeleted,
  onClose,
}: {
  meal: PlannerMeal;
  label: string;
  onDeleted?: () => void;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<SeriesScope>("this");
  const [pending, startTransition] = useTransition();
  const radioGroup = useId();

  const remove = (picked: SeriesScope) => async () => {
    await removeMealAction(meal.id, picked);
    onDeleted?.();
  };

  if (meal.repeats === null) {
    return (
      <ConfirmSheet
        title={t("sheet.deleteTitle", { name: label })}
        confirmLabel={t("sheet.delete")}
        destructive
        onConfirm={remove("this")}
        onClose={onClose}
      />
    );
  }

  const date = formatMealDate(meal.date);
  return (
    <Sheet
      eyebrow={
        <>
          <RepeatIcon />
          {t("planner.deleteRepeat.eyebrow", { name: label, repeats: formatRepeats(meal.repeats) })}
        </>
      }
      title={t("planner.deleteRepeat.title", { names: pluralName(label) })}
      busy={pending}
      onClose={onClose}
    >
      <fieldset className="delete-scopes" disabled={pending}>
        <legend className="visually-hidden">{t("planner.deleteRepeat.options")}</legend>
        {SCOPES.map((option) => (
          <label key={option} className="delete-scope">
            <input
              type="radio"
              name={radioGroup}
              value={option}
              checked={scope === option}
              onChange={() => setScope(option)}
            />
            <span className="delete-scope-text">
              <span className="delete-scope-name">{t(`planner.deleteRepeat.${option}`)}</span>
              <span className="delete-scope-hint">{t(`planner.deleteRepeat.${option}Hint`, { date, name: label })}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="delete-scope-note">
        <LockIcon />
        {t("planner.deleteRepeat.unchanged")}
      </p>
      <div className="sheet-actions">
        <button type="button" onClick={onClose} disabled={pending}>
          {t("sheet.cancel")}
        </button>
        <button
          type="button"
          className="button-delete"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await remove(scope)();
              onClose();
            })
          }
        >
          {t("sheet.delete")}
        </button>
      </div>
    </Sheet>
  );
}

// Two arrows chasing each other: a Meal Series.
function RepeatIcon() {
  return (
    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11V9a3 3 0 0 1 3-3h15" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v2a3 3 0 0 1-3 3H3" />
    </svg>
  );
}
