"use client";

import { useState } from "react";
import { plannerWeeks } from "@/core/planner";
import {
  chosenRange,
  GENERATE_PRESETS,
  generatePresets,
  isGenerateRange,
  type DateRange,
  type DatesChoice,
} from "@/core/shopping-list";
import { formatDateRange, formatMealDate, t } from "@/strings";
import { FormError } from "../form-error";
import { Sheet } from "../sheet";

// What the dates button shows: "Next week · 16–22 Nov", or the dates alone
// for dates of your own. Before the viewer's date is known, only the preset.
export function datesLabel(choice: DatesChoice, today: string | null): string {
  if (!choice.preset) return formatDateRange(choice.range.from, choice.range.to);
  const preset = t(`shopping.${choice.preset}`);
  if (!today) return preset;
  const { from, to } = chosenRange(choice, today);
  return t("shopping.presetDates", { preset, dates: formatDateRange(from, to) });
}

// Choose dates: a preset, or From and To in the Planner's two weeks. The
// fields offer only those days, so only From after To can be wrong. Picking a
// preset fills From and To; editing them picks none. Cancel changes nothing.
export function ChooseDates({
  today,
  choice,
  onUse,
  onClose,
}: {
  today: string;
  choice: DatesChoice;
  onUse: (choice: DatesChoice) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(choice);
  const presets = generatePresets(today);
  const range = chosenRange(draft, today);
  const { thisWeek, nextWeek } = plannerWeeks(today);
  const days = [...thisWeek, ...nextWeek];
  const valid = isGenerateRange(today, range);
  const edit = (change: Partial<DateRange>) => setDraft({ preset: null, range: { ...range, ...change } });

  return (
    <Sheet eyebrow={t("shopping.fromShortfalls")} title={t("shopping.chooseDates")} onClose={onClose}>
      <fieldset className="dates-presets">
        <legend className="visually-hidden">{t("shopping.chooseDates")}</legend>
        {GENERATE_PRESETS.map((preset) => (
          <label key={preset} className="dates-preset">
            <input
              type="radio"
              name="preset"
              value={preset}
              checked={draft.preset === preset}
              onChange={() => setDraft({ preset })}
            />
            <span className="dates-preset-name">{t(`shopping.${preset}`)}</span>
            <span className="dates-preset-dates">{formatDateRange(presets[preset].from, presets[preset].to)}</span>
          </label>
        ))}
      </fieldset>
      <div className="dates-fields">
        <DayField name="from" label={t("shopping.datesFrom")} days={days} value={range.from} invalid={!valid} onChange={(from) => edit({ from })} />
        <DayField name="to" label={t("shopping.datesTo")} days={days} value={range.to} invalid={!valid} onChange={(to) => edit({ to })} />
      </div>
      <p className="field-hint">{t("shopping.datesHint")}</p>
      {!valid && <FormError>{t("shopping.datesOrder")}</FormError>}
      <div className="sheet-actions">
        <button type="button" onClick={onClose}>
          {t("sheet.cancel")}
        </button>
        <button type="button" className="button-primary" disabled={!valid} onClick={() => onUse(draft)}>
          {t("shopping.useDates")}
        </button>
      </div>
    </Sheet>
  );
}

// From or To: one of the Planner's 14 days, as in "Thu 12 Nov".
function DayField({
  name,
  label,
  days,
  value,
  invalid,
  onChange,
}: {
  name: keyof DateRange;
  label: string;
  days: string[];
  value: string;
  invalid: boolean;
  onChange: (day: string) => void;
}) {
  return (
    <label className="dates-field">
      {label}
      <select name={name} value={value} aria-invalid={invalid || undefined} onChange={(event) => onChange(event.target.value)}>
        {days.map((day) => (
          <option key={day} value={day}>
            {formatMealDate(day)}
          </option>
        ))}
      </select>
    </label>
  );
}
