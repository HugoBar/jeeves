"use client";

import { Fragment, useActionState, useState } from "react";
import { sortMeals, sortMealsByDay, weekToClose } from "@/core/meals";
import { plannerWeeks } from "@/core/planner";
import { dayHeadingParts, editingLabel, formatDayHeading, formatLongDayHeading, formatWeekRange, t } from "@/strings";
import { MEAL_FROM_TEMPLATE_ERROR_FIELDS } from "../field-errors";
import { useFieldErrors } from "../form-error";
import { useViewerNow } from "../viewer-clock";
import { createMealAction, createMealFromTemplateAction, type MealFromTemplateFormState, type NewMealFormState } from "./actions";
import {
  MealCard,
  mealOnLabel,
  useMealErrors,
  type PickerOption,
  type Pickers,
  type PlannerMeal,
  type Submitted,
  type Week,
} from "./meal-card";

// "Today" is the date in the viewer's time zone (spec "Platform"). The server
// cannot know that zone, so it renders only the heading and the browser fills
// the planner in after hydration.
export function Planner({ meals, ...pickers }: { meals: PlannerMeal[] } & Pickers) {
  const now = useViewerNow();
  const [week, setWeek] = useState<Week>("this");
  if (!now)
    return (
      <div className="planner-head">
        <h1>{t("planner.title")}</h1>
      </div>
    );
  return <PlannerView today={now.date} week={week} meals={meals} pickers={pickers} onWeekChange={setWeek} />;
}

// The Planner on `today`, showing one of its two weeks.
export function PlannerView({
  today,
  week,
  meals,
  pickers,
  onWeekChange,
}: {
  today: string;
  week: Week;
  meals: PlannerMeal[];
  pickers: Pickers;
  onWeekChange: (week: Week) => void;
}) {
  const weeks = plannerWeeks(today);
  const days = week === "next" ? weeks.nextWeek : weeks.thisWeek;
  return (
    <div className={week === "next" ? "planner-week planner-week-next" : "planner-week"}>
      <div className="planner-head">
        <h1>{t("planner.title")}</h1>
        <WeekTabs week={week} onWeekChange={onWeekChange} />
        <WeekBar week={week} days={days} today={today} />
      </div>
      <CloseWeekBanner meals={weekToClose(meals, today)} />
      <PlannerWeek week={week} days={days} today={today} meals={meals} pickers={pickers} />
    </div>
  );
}

// The week's name and dates, and on phone a strip of its days. Each day links
// to its heading below, so a tap scrolls to it.
function WeekBar({ week, days, today }: { week: Week; days: string[]; today: string }) {
  const dates = formatWeekRange(days[0]!, days[6]!);
  return (
    <div className="planner-week-bar">
      <p className="planner-week-label">{t(week === "next" ? "planner.nextWeek" : "planner.thisWeek", { dates })}</p>
      <nav aria-label={t("planner.days")} className="planner-strip">
        {days.map((date) => {
          const { weekday, day } = dayHeadingParts(date);
          return (
            <a key={date} href={`#${dayId(date)}`} aria-current={date === today ? "date" : undefined}>
              <span>{weekday}</span>
              <strong>{day}</strong>
            </a>
          );
        })}
      </nav>
    </div>
  );
}

const dayId = (date: string) => `planner-day-${date}`;

const WEEKS: readonly Week[] = ["this", "next"];

// This week and Next week, each with its own accent on its dot. Arrow keys
// move between them, as tabs do.
function WeekTabs({ week, onWeekChange }: { week: Week; onWeekChange: (week: Week) => void }) {
  return (
    <div
      role="tablist"
      aria-label={t("planner.weeks")}
      className="planner-tabs"
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        const other = week === "this" ? "next" : "this";
        onWeekChange(other);
        document.getElementById(`planner-tab-${other}`)?.focus();
      }}
    >
      {WEEKS.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          id={`planner-tab-${tab}`}
          aria-selected={tab === week}
          aria-controls="planner-days"
          tabIndex={tab === week ? 0 : -1}
          className={`planner-tab planner-tab-${tab}`}
          onClick={() => onWeekChange(tab)}
        >
          <span className="planner-tab-dot" aria-hidden="true" />
          {t(tab === "next" ? "planner.nextWeekTab" : "planner.thisWeekTab")}
        </button>
      ))}
    </div>
  );
}

// From Saturday, this week's Unconfirmed Meals, so the week can be closed
// before the next starts (#1). Their cards below can Confirm or Skip them.
function CloseWeekBanner({ meals }: { meals: PlannerMeal[] }) {
  if (meals.length === 0) return null;
  return (
    <aside className="banner" role="status">
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 9v4M12 17h.01" />
        <path d="M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      </svg>
      <div>
        <h2>{t("unconfirmed.closeWeek")}</h2>
        <p>{t("unconfirmed.closeWeekBody")}</p>
        <ul>
          {sortMealsByDay(meals).map((meal) => (
            <li key={meal.id}>
              {mealOnLabel(meal)}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

// The week's days: one under another on phone, seven columns on desktop.
function PlannerWeek({
  week,
  days,
  today,
  meals,
  pickers,
}: {
  week: Week;
  days: string[];
  today: string;
  meals: PlannerMeal[];
  pickers: Pickers;
}) {
  return (
    <div role="tabpanel" id="planner-days" aria-labelledby={`planner-tab-${week}`} className="planner-days">
      {days.map((date) => (
        <PlannerDay
          key={date}
          date={date}
          week={week}
          today={today}
          meals={sortMeals(meals.filter((meal) => meal.date === date))}
          pickers={pickers}
        />
      ))}
    </div>
  );
}

function PlannerDay({
  date,
  week,
  today,
  meals,
  pickers,
}: {
  date: string;
  week: Week;
  today: string;
  meals: PlannerMeal[];
  pickers: Pickers;
}) {
  const [adding, setAdding] = useState<"scratch" | "template" | null>(null);
  const isToday = date === today;
  const longHeading = formatLongDayHeading(date);
  const onFromTemplate = pickers.templates.length > 0 ? () => setAdding("template") : undefined;
  return (
    <section
      id={dayId(date)}
      className={isToday ? "planner-day planner-day-today" : "planner-day"}
      aria-current={isToday ? "date" : undefined}
    >
      <div className="planner-day-head">
        <h2>
          <span className="phone-only">{longHeading}</span>
          <span className="desktop-only">{formatDayHeading(date)}</span>
          {isToday && <span className="planner-today">{t("planner.today")}</span>}
        </h2>
        <button
          type="button"
          className="planner-add"
          aria-label={t("planner.addMealOn", { day: longHeading })}
          aria-expanded={adding !== null}
          onClick={() => setAdding(adding === null ? "scratch" : null)}
        >
          <span className="phone-only">{t("planner.addMeal")}</span>
          <span className="desktop-only" aria-hidden="true">
            {t("planner.addMealShort")}
          </span>
        </button>
      </div>
      {meals.length === 0 ? (
        <p className="planner-empty">{t("planner.empty")}</p>
      ) : (
        <ul className="planner-meals">
          {meals.map((meal) => (
            <li key={meal.id}>
              <MealCard meal={meal} week={week} today={today} pickers={pickers} />
            </li>
          ))}
        </ul>
      )}
      {adding === "scratch" && (
        <AddMealForm
          date={date}
          week={week}
          mealTypes={pickers.mealTypes}
          onFromTemplate={onFromTemplate}
          onDone={() => setAdding(null)}
        />
      )}
      {adding === "template" && (
        <AddMealFromTemplateForm
          date={date}
          week={week}
          templates={pickers.templates}
          onFromScratch={() => setAdding("scratch")}
          onDone={() => setAdding(null)}
        />
      )}
    </section>
  );
}

// From scratch. `onFromTemplate`, given when there are Meal Templates, swaps
// this form for the one that adds from a Meal Template.
function AddMealForm({
  date,
  week,
  mealTypes,
  onFromTemplate,
  onDone,
}: {
  date: string;
  week: Week;
  mealTypes: PickerOption[];
  onFromTemplate?: () => void;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(
    async ({ submits, ...previous }: Submitted<NewMealFormState>, formData: FormData) => {
      const next = await createMealAction(date, previous, formData);
      if (next.errors.length === 0) onDone();
      return { ...next, submits: submits + 1 };
    },
    { errors: [], values: { mealTypeId: "", hour: "", name: "" }, submits: 0 },
  );
  const { values } = state;
  const { invalid, allMessages } = useMealErrors(state.errors);
  return (
    <form action={action} className="item-form planner-form open-row">
      <p className="planner-editing">{editingLabel(date, week)}</p>
      <Fragment key={state.submits}>
        <select
          name="mealTypeId"
          aria-label={t("planner.mealType")}
          defaultValue={values.mealTypeId}
          autoFocus
          {...invalid("mealType")}
        >
          <option value="">{t("planner.pickMealType")}</option>
          {mealTypes.map((mealType) => (
            <option key={mealType.id} value={mealType.id}>
              {mealType.label}
            </option>
          ))}
        </select>
        <input type="time" name="hour" aria-label={t("planner.hour")} defaultValue={values.hour} {...invalid("hour")} />
        <input name="name" aria-label={t("planner.name")} placeholder={t("planner.name")} defaultValue={values.name} />
      </Fragment>
      <button type="submit" className="button-primary" disabled={pending}>
        {t("planner.add")}
      </button>
      <button type="button" onClick={onDone}>
        {t("planner.cancel")}
      </button>
      {onFromTemplate && (
        <button type="button" className="button-soft" onClick={onFromTemplate}>
          {t("planner.addFromTemplate")}
        </button>
      )}
      {allMessages()}
    </form>
  );
}

// Copies the picked template's name, Meal Type, hour and empty slots; the
// Meal can be edited afterwards like any other.
function AddMealFromTemplateForm({
  date,
  week,
  templates,
  onFromScratch,
  onDone,
}: {
  date: string;
  week: Week;
  templates: PickerOption[];
  onFromScratch: () => void;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(
    async ({ submits, ...previous }: Submitted<MealFromTemplateFormState>, formData: FormData) => {
      const next = await createMealFromTemplateAction(date, previous, formData);
      if (next.errors.length === 0) onDone();
      return { ...next, submits: submits + 1 };
    },
    { errors: [], templateId: "", submits: 0 },
  );
  const { invalid, allMessages } = useFieldErrors(
    state.errors,
    (error) => MEAL_FROM_TEMPLATE_ERROR_FIELDS[error],
    (error) => t(`planner.error.${error}`),
  );
  return (
    <form action={action} className="item-form planner-form open-row">
      <p className="planner-editing">{editingLabel(date, week)}</p>
      <select
        key={state.submits}
        name="templateId"
        aria-label={t("planner.template")}
        defaultValue={state.templateId}
        autoFocus
        {...invalid("template")}
      >
        <option value="">{t("planner.pickTemplate")}</option>
        {templates.map((template) => (
          <option key={template.id} value={template.id}>
            {template.label}
          </option>
        ))}
      </select>
      <button type="submit" className="button-primary" disabled={pending}>
        {t("planner.add")}
      </button>
      <button type="button" onClick={onDone}>
        {t("planner.cancel")}
      </button>
      <button type="button" className="button-soft" onClick={onFromScratch}>
        {t("planner.fromScratch")}
      </button>
      {allMessages()}
    </form>
  );
}

