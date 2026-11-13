"use client";

import { useId, useState, useTransition } from "react";
import type { SeriesScope, Weekday } from "@/core/meal-series";
import { formatMealDate, formatRepeats, pluralName, t } from "@/strings";
import { LockIcon } from "../form-error";
import { Sheet } from "../sheet";

const SCOPES: readonly SeriesScope[] = ["this", "following"];

// Asks which Meals of a Meal Series deleting or changing one of them applies
// to, `label` being its name or Meal Type: only this one, picked first, or
// it and every later Planned one (spec "Meal Series"). Delete is red; Save
// takes the week's accent. `onPick` runs with the answer, and the sheet
// closes once it is done. Cancel, Close and Escape change nothing.
export function SeriesScopeSheet({
  kind,
  meal,
  label,
  onPick,
  onClose,
}: {
  kind: "delete" | "change";
  meal: { date: string; repeats: readonly Weekday[] };
  label: string;
  onPick: (scope: SeriesScope) => void | Promise<void>;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<SeriesScope>("this");
  const [pending, startTransition] = useTransition();
  const radioGroup = useId();
  const date = formatMealDate(meal.date);
  return (
    <Sheet
      eyebrow={
        <>
          <RepeatIcon />
          {t("planner.repeatScope.eyebrow", { name: label, repeats: formatRepeats(meal.repeats) })}
        </>
      }
      title={t(`planner.${kind}Repeat.title`, { names: pluralName(label) })}
      busy={pending}
      onClose={onClose}
    >
      <fieldset className={`series-scopes series-scopes-${kind}`} disabled={pending}>
        <legend className="visually-hidden">{t(`planner.${kind}Repeat.options`)}</legend>
        {SCOPES.map((option) => (
          <label key={option} className="series-scope">
            <input
              type="radio"
              name={radioGroup}
              value={option}
              checked={scope === option}
              onChange={() => setScope(option)}
            />
            <span className="series-scope-text">
              <span className="series-scope-name">{t(`planner.repeatScope.${option}`)}</span>
              <span className="series-scope-hint">{t(`planner.${kind}Repeat.${option}Hint`, { date, name: label })}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="series-scope-note">
        <LockIcon />
        {t("planner.repeatScope.unchanged")}
      </p>
      <div className="sheet-actions">
        <button type="button" onClick={onClose} disabled={pending}>
          {t("sheet.cancel")}
        </button>
        <button
          type="button"
          className={kind === "delete" ? "button-delete" : "button-primary"}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await onPick(scope);
              onClose();
            })
          }
        >
          {t(kind === "delete" ? "sheet.delete" : "planner.save")}
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
