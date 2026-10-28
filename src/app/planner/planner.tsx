"use client";

import { Fragment, useActionState, useState, useSyncExternalStore } from "react";
import {
  isPlanned,
  sortMeals,
  type MealFieldError,
  type MealFromTemplateError,
  type MealStatus,
} from "@/core/meals";
import { localDate, plannerWeeks } from "@/core/planner";
import { editingLabel, formatDayHeading, formatWeekRange, t } from "@/strings";
import { RemoveButton } from "../remove-button";
import {
  createMealAction,
  createMealFromTemplateAction,
  editMealAction,
  removeMealAction,
  setMealSlotCategoryAction,
  setMealUntrackedAction,
  type MealChangesFormState,
  type MealFromTemplateFormState,
  type MealSlotCategoryFormState,
  type NewMealFormState,
} from "./actions";

// A Meal with what its card shows. Its Meal Type may be Archived: the Meal
// keeps it.
export interface PlannerMeal {
  id: string;
  date: string;
  hour: string;
  createdAt: Date;
  name: string | null;
  mealTypeLabel: string;
  mealTypeArchived: boolean;
  status: MealStatus;
  untracked: boolean;
  slots: PlannerMealSlot[];
}

// A Meal Slot with what its card shows. Its Slot Category may be Archived:
// the slot keeps it until it is changed.
export interface PlannerMealSlot {
  id: string;
  slotCategoryId: string;
  slotCategoryLabel: string;
  slotCategoryArchived: boolean;
}

// A Meal Type, Meal Template or Food Category a picker offers, by the label
// the user sees.
export interface PickerOption {
  id: string;
  label: string;
}

// What the planner's pickers offer: Meal Types and Food Categories that are
// not Archived, and every Meal Template.
interface Pickers {
  mealTypes: PickerOption[];
  templates: PickerOption[];
  slotCategories: PickerOption[];
}

type Week = "this" | "next";

// React resets a form after every submit, putting each field back to the value
// it mounted with. Counting submits gives the fields a new key each time, so
// they remount with what was sent and the reset keeps it.
type Submitted<State> = State & { submits: number };

const subscribe = () => () => {};

// "Today" is the date in the viewer's time zone (spec "Platform"). The server
// cannot know that zone, so it renders nothing and the browser fills the
// planner in after hydration.
export function Planner({ meals, ...pickers }: { meals: PlannerMeal[] } & Pickers) {
  const today = useSyncExternalStore(subscribe, () => localDate(new Date()), () => null);
  if (!today) return null;

  const { thisWeek, nextWeek } = plannerWeeks(today);
  const props = { today, meals, pickers };
  return (
    <>
      <PlannerWeek week="this" days={thisWeek} {...props} />
      <PlannerWeek week="next" days={nextWeek} {...props} />
    </>
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
              <MealCard meal={meal} week={week} today={today} slotCategories={pickers.slotCategories} />
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
      {adding === null && (
        <span className="planner-add">
          <button type="button" onClick={() => setAdding("scratch")}>
            {t("planner.addMeal")}
          </button>
          {pickers.templates.length > 0 && (
            <button type="button" onClick={() => setAdding("template")}>
              {t("planner.addFromTemplate")}
            </button>
          )}
        </span>
      )}
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
  return (
    <form action={action} className="item-form planner-form">
      <p className="planner-editing">{editingLabel(date, week)}</p>
      <Fragment key={state.submits}>
        <select name="mealTypeId" aria-label={t("planner.mealType")} defaultValue={values.mealTypeId} autoFocus>
          <option value="">{t("planner.pickMealType")}</option>
          {mealTypes.map((mealType) => (
            <option key={mealType.id} value={mealType.id}>
              {mealType.label}
            </option>
          ))}
        </select>
        <input type="time" name="hour" aria-label={t("planner.hour")} defaultValue={values.hour} />
        <input name="name" aria-label={t("planner.name")} placeholder={t("planner.name")} defaultValue={values.name} />
      </Fragment>
      <button type="submit" disabled={pending}>
        {t("planner.add")}
      </button>
      <button type="button" onClick={onDone}>
        {t("planner.cancel")}
      </button>
      <FormErrors state={state} />
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
  return (
    <form action={action} className="item-form planner-form">
      <p className="planner-editing">{editingLabel(date, week)}</p>
      <select
        key={state.submits}
        name="templateId"
        aria-label={t("planner.template")}
        defaultValue={state.templateId}
        autoFocus
      >
        <option value="">{t("planner.pickTemplate")}</option>
        {templates.map((template) => (
          <option key={template.id} value={template.id}>
            {template.label}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending}>
        {t("planner.add")}
      </button>
      <button type="button" onClick={onDone}>
        {t("planner.cancel")}
      </button>
      <FormErrors state={state} />
    </form>
  );
}

// A Meal on its day, edited in place. Its Meal Type is shown but never changes.
function MealCard({
  meal,
  week,
  today,
  slotCategories,
}: {
  meal: PlannerMeal;
  week: Week;
  today: string;
  slotCategories: PickerOption[];
}) {
  const [editing, setEditing] = useState(false);
  const label = meal.name ?? meal.mealTypeLabel;
  const planned = isPlanned(meal, today);

  if (editing) return <EditMealForm meal={meal} week={week} onDone={() => setEditing(false)} />;

  return (
    <div className="item-row planner-meal">
      <span className="planner-meal-hour">{meal.hour}</span>
      <span className="planner-meal-label">
        {label}
        {meal.mealTypeArchived && <span className="planner-tag">{t("planner.mealTypeArchived")}</span>}
        {meal.untracked && <span className="planner-tag">{t("planner.untracked")}</span>}
      </span>
      <span className="planner-meal-actions">
        <button type="button" onClick={() => setEditing(true)}>
          {t("planner.edit")}
        </button>
        <form action={setMealUntrackedAction.bind(null, meal.id, !meal.untracked)}>
          <button type="submit">{t(meal.untracked ? "planner.unmarkUntracked" : "planner.markUntracked")}</button>
        </form>
        <RemoveButton
          action={removeMealAction.bind(null, meal.id)}
          label={t("planner.remove")}
          confirmMessage={t("planner.removeConfirm", { name: label })}
        />
      </span>
      {meal.slots.length > 0 && (
        <ol className="slot-list" aria-label={t("planner.slots")}>
          {meal.slots.map((slot) => (
            // A new key once a change is saved, so the picker mounts with it.
            <li key={`${slot.id}:${slot.slotCategoryId}`}>
              {planned ? (
                <SlotCategoryPicker slot={slot} slotCategories={slotCategories} />
              ) : (
                slot.slotCategoryLabel
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// A Planned slot's Slot Category, saved as soon as one is picked; a past
// Meal's slots only show theirs as it was. The picker offers only
// non-Archived Food Categories, plus the slot's own if it is Archived, which
// it warns about until it is changed.
function SlotCategoryPicker({ slot, slotCategories }: { slot: PlannerMealSlot; slotCategories: PickerOption[] }) {
  const [state, action, pending] = useActionState(
    (previous: MealSlotCategoryFormState, formData: FormData) =>
      setMealSlotCategoryAction(slot.id, previous, formData),
    { error: null },
  );
  return (
    <form action={action}>
      <select
        name="slotCategoryId"
        aria-label={t("planner.slotCategory")}
        defaultValue={slot.slotCategoryId}
        disabled={pending}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        {slot.slotCategoryArchived && <option value={slot.slotCategoryId}>{slot.slotCategoryLabel}</option>}
        {slotCategories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.label}
          </option>
        ))}
      </select>
      {slot.slotCategoryArchived && <span className="form-error"> {t("planner.slotArchived")}</span>}
      {state.error && <p className="form-error">{t(`planner.error.${state.error}`)}</p>}
    </form>
  );
}

// Unmounted when closed, so its errors go with it.
function EditMealForm({ meal, week, onDone }: { meal: PlannerMeal; week: Week; onDone: () => void }) {
  const [state, action, pending] = useActionState(
    async ({ submits, ...previous }: Submitted<MealChangesFormState>, formData: FormData) => {
      const next = await editMealAction(meal.id, previous, formData);
      if (next.errors.length === 0) onDone();
      return { ...next, submits: submits + 1 };
    },
    { errors: [], values: { hour: meal.hour, name: meal.name ?? "" }, submits: 0 },
  );
  const { values } = state;
  return (
    <form action={action} className="item-form planner-form">
      <p className="planner-editing">{editingLabel(meal.date, week)}</p>
      <span>{meal.mealTypeLabel}</span>
      <Fragment key={state.submits}>
        <input type="time" name="hour" aria-label={t("planner.hour")} defaultValue={values.hour} autoFocus />
        <input name="name" aria-label={t("planner.name")} placeholder={t("planner.name")} defaultValue={values.name} />
      </Fragment>
      <button type="submit" disabled={pending}>
        {t("planner.save")}
      </button>
      <button type="button" onClick={onDone}>
        {t("planner.cancel")}
      </button>
      <FormErrors state={state} />
    </form>
  );
}

function FormErrors({ state }: { state: { errors: (MealFieldError | MealFromTemplateError)[] } }) {
  return state.errors.map((error) => (
    <p key={error} className="form-error">
      {t(`planner.error.${error}`)}
    </p>
  ));
}
