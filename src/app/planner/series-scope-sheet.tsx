"use client";

import { useId, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import type { SeriesScope, Weekday } from "@/core/meal-series";
import { formatMealDate, formatRepeats, pluralName, t, type StringKey } from "@/strings";
import { LockIcon } from "../form-error";
import { Sheet } from "../sheet";

const SCOPES: readonly SeriesScope[] = ["this", "following"];

// What the question is asked before: deleting, saving a change, or adding a
// slot.
export type SeriesScopeKind = "delete" | "change" | "addSlot";

const ACTIONS = {
  delete: "sheet.delete",
  change: "planner.save",
  addSlot: "planner.addSlotRepeat.confirm",
} as const satisfies Record<SeriesScopeKind, StringKey>;

// Asks which Meals of a Meal Series deleting, changing or adding a slot to
// one of them applies to, `label` being its name or Meal Type and
// `category` the new slot's Slot Category: only this one, picked first, or
// it and every later Planned one (spec "Meal Series"). Delete is red; Save
// and Add slot take the week's accent. `onPick` runs with the answer, and the sheet
// closes once it is done. Cancel, Close and Escape change nothing.
export function SeriesScopeSheet({
  kind,
  meal,
  label,
  category = "",
  onPick,
  onClose,
}: {
  kind: SeriesScopeKind;
  meal: { date: string; repeats: readonly Weekday[] };
  label: string;
  category?: string;
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
              <span className="series-scope-hint">{t(`planner.${kind}Repeat.${option}Hint`, { date, name: label, category })}</span>
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
          {t(ACTIONS[kind])}
        </button>
      </div>
    </Sheet>
  );
}

// Asks which Meals of its Meal Series a form's submit applies to before it is
// sent, then sends it with the answer as "seriesScope". It asks only on a
// `meal` of a series (none: a Meal not saved yet, or a change kept on the
// form until Save), and only when `asks` says the form, as it would be sent,
// changes something. The form takes `onSubmit` and has `field` inside it;
// `sheet` goes outside it, so the question's choices aren't sent with it.
export function useAskWhichMeals({
  kind,
  meal,
  category,
  asks = () => true,
}: {
  kind: Exclude<SeriesScopeKind, "delete">;
  meal: { date: string; repeats: readonly Weekday[] | null; name: string | null; mealTypeLabel: string } | null;
  category?: string;
  asks?: (data: FormData) => boolean;
}): { onSubmit: (event: FormEvent<HTMLFormElement>) => void; field: ReactNode; sheet: ReactNode } {
  const form = useRef<HTMLFormElement | null>(null);
  const scope = useRef<HTMLInputElement>(null);
  const answered = useRef(false);
  const [asking, setAsking] = useState(false);
  const repeats = meal?.repeats ?? null;
  if (!meal || repeats === null) return { onSubmit: () => {}, field: null, sheet: null };
  return {
    onSubmit: (event) => {
      if (answered.current) {
        answered.current = false;
        return;
      }
      if (scope.current) scope.current.value = "this";
      if (!asks(new FormData(event.currentTarget))) return;
      event.preventDefault();
      form.current = event.currentTarget;
      setAsking(true);
    },
    field: <input ref={scope} type="hidden" name="seriesScope" defaultValue="this" />,
    sheet: asking && (
      <SeriesScopeSheet
        kind={kind}
        meal={{ date: meal.date, repeats }}
        label={meal.name ?? meal.mealTypeLabel}
        category={category}
        onPick={(picked) => {
          if (scope.current) scope.current.value = picked;
          answered.current = true;
          form.current?.requestSubmit();
        }}
        onClose={() => setAsking(false)}
      />
    ),
  };
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
