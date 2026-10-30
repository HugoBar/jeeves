"use client";

import { Fragment, useActionState, useState } from "react";
import { sortMeals, sortMealsByDay, weekToClose } from "@/core/meals";
import { plannerWeeks } from "@/core/planner";
import { editingLabel, formatDayHeading, formatWeekRange, t } from "@/strings";
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
// cannot know that zone, so it renders nothing and the browser fills the
// planner in after hydration.
export function Planner({ meals, ...pickers }: { meals: PlannerMeal[] } & Pickers) {
  const now = useViewerNow();
  if (!now) return null;

  const today = now.date;

  const { thisWeek, nextWeek } = plannerWeeks(today);
  const props = { today, meals, pickers };
  return (
    <>
      <CloseWeekBanner meals={weekToClose(meals, today)} />
      <PlannerWeek week="this" days={thisWeek} {...props} />
      <PlannerWeek week="next" days={nextWeek} {...props} />
    </>
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
  const dates = formatWeekRange(days[0]!, days[6]!);
  return (
    <section className={week === "next" ? "planner-week planner-week-next" : "planner-week"}>
      <h2 className="planner-week-header">
        {t(week === "next" ? "planner.nextWeek" : "planner.thisWeek", { dates })}
      </h2>
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
    </section>
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
  return (
    <section className={isToday ? "planner-day planner-day-today" : "planner-day"} aria-current={isToday ? "date" : undefined}>
      <h3>
        {formatDayHeading(date)}
        {isToday && <span className="planner-tag">{t("planner.today")}</span>}
      </h3>
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
        <AddMealForm date={date} week={week} mealTypes={pickers.mealTypes} onDone={() => setAdding(null)} />
      )}
      {adding === "template" && (
        <AddMealFromTemplateForm
          date={date}
          week={week}
          templates={pickers.templates}
          onDone={() => setAdding(null)}
        />
      )}
      <span className="planner-add">
        <button
          type="button"
          className="button-soft"
          aria-pressed={adding === "scratch"}
          onClick={() => setAdding(adding === "scratch" ? null : "scratch")}
        >
          {t("planner.addMeal")}
        </button>
        {pickers.templates.length > 0 && (
          <button
            type="button"
            className="button-soft"
            aria-pressed={adding === "template"}
            onClick={() => setAdding(adding === "template" ? null : "template")}
          >
            {t("planner.addFromTemplate")}
          </button>
        )}
      </span>
    </section>
  );
}

function AddMealForm({
  date,
  week,
  mealTypes,
  onDone,
}: {
  date: string;
  week: Week;
  mealTypes: PickerOption[];
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
  onDone,
}: {
  date: string;
  week: Week;
  templates: PickerOption[];
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
      {allMessages()}
    </form>
  );
}

