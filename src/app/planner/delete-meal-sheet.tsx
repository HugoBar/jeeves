"use client";

import type { SeriesScope } from "@/core/meal-series";
import { t } from "@/strings";
import { ConfirmSheet } from "../sheet";
import { removeMealAction } from "./actions";
import type { PlannerMeal } from "./meal-card";
import { SeriesScopeSheet } from "./series-scope-sheet";

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
  const remove = async (scope: SeriesScope) => {
    await removeMealAction(meal.id, scope);
    onDeleted?.();
  };

  if (meal.repeats === null) {
    return (
      <ConfirmSheet
        title={t("sheet.deleteTitle", { name: label })}
        confirmLabel={t("sheet.delete")}
        destructive
        onConfirm={() => remove("this")}
        onClose={onClose}
      />
    );
  }

  return (
    <SeriesScopeSheet
      kind="delete"
      meal={{ date: meal.date, repeats: meal.repeats }}
      label={label}
      onPick={remove}
      onClose={onClose}
    />
  );
}
