"use client";

import { Fragment, useActionState, useState } from "react";
import { flushSync } from "react-dom";
import { isUnconfirmed, sortMeals, sortMealsByDay, weekToClose, type NewMealSlotInput } from "@/core/meals";
import { plannerWeeks } from "@/core/planner";
import {
  dayHeadingParts,
  formatDayHeading,
  formatLongDayHeading,
  formatMealCount,
  formatSlotCount,
  formatWeekRange,
  mealPanelLabel,
  t,
} from "@/strings";
import { FoodCategoryPill } from "../food-category-pill";
import { FormCard } from "../form-card";
import { SidePanel } from "../side-panel";
import { useViewerNow } from "../viewer-clock";
import { createMealAction, type NewMealFormState, type NewMealFormValues } from "./actions";
import { AddSlotBody, addSlotTitle, addToMealForm, type AddSlotScreen } from "./add-slot";
import {
  EditMealPanel,
  MealCard,
  MealPanelActions,
  MealPanelIcon,
  mealOnLabel,
  MealFormFields,
  mealPanelClass,
  NewMealSlotsCard,
  type Pickers,
  type PlannerMeal,
  type Submitted,
  type TemplateOption,
  type Week,
  UnconfirmedIcon,
} from "./meal-card";
import { ChevronIcon } from "./slot-picker";

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
  // On phone, this week's days before today fold into one row.
  const earlier = week === "this" ? days.filter((date) => date < today) : [];
  const [earlierOpen, setEarlierOpen] = useState(false);
  const foldedDays = earlierOpen ? [] : earlier;
  const [panel, setPanel] = useState<MealPanel>(null);
  const weekOf = (date: string): Week => (weeks.nextWeek.includes(date) ? "next" : "this");
  // Gone once it is deleted, which closes its panel.
  const editing = panel?.kind === "edit" ? meals.find((meal) => meal.id === panel.mealId) : undefined;
  return (
    <div className={week === "next" ? "planner-week planner-week-next" : "planner-week"}>
      <div className="planner-head">
        <h1>{t("planner.title")}</h1>
        <WeekTabs week={week} onWeekChange={onWeekChange} />
        <WeekBar week={week} days={days} today={today} foldedDays={foldedDays} onUnfold={() => setEarlierOpen(true)} />
      </div>
      <CloseWeekBanner meals={weekToClose(meals, today)} />
      <PlannerWeek
        week={week}
        days={days}
        today={today}
        meals={meals}
        pickers={pickers}
        earlier={earlier}
        foldedDays={foldedDays}
        onEarlierToggle={() => setEarlierOpen(!earlierOpen)}
        addingOn={panel?.kind === "add" ? panel.date : null}
        onAdd={(date) => setPanel(panel?.kind === "add" && panel.date === date ? null : { kind: "add", date })}
        onEdit={(mealId) => setPanel({ kind: "edit", mealId })}
      />
      {panel?.kind === "add" && (
        <AddMealPanel
          key={panel.date}
          date={panel.date}
          week={weekOf(panel.date)}
          pickers={pickers}
          onClose={() => setPanel(null)}
        />
      )}
      {editing && (
        <EditMealPanel
          key={editing.id}
          meal={editing}
          week={weekOf(editing.date)}
          pickers={pickers}
          onClose={() => setPanel(null)}
        />
      )}
    </div>
  );
}

// What the side panel shows: New Meal on a day, or Edit Meal. One at a time.
type MealPanel = { kind: "add"; date: string } | { kind: "edit"; mealId: string } | null;

// The week's name and dates, and on phone a strip of its days. Each day links
// to its heading below, so a tap scrolls to it, first unfolding it when it is
// folded into Earlier this week.
function WeekBar({
  week,
  days,
  today,
  foldedDays,
  onUnfold,
}: {
  week: Week;
  days: string[];
  today: string;
  foldedDays: string[];
  onUnfold: () => void;
}) {
  const dates = formatWeekRange(days[0]!, days[6]!);
  return (
    <div className="planner-week-bar">
      <p className="planner-week-label">{t(week === "next" ? "planner.nextWeek" : "planner.thisWeek", { dates })}</p>
      <nav aria-label={t("planner.days")} className="planner-strip">
        {days.map((date) => {
          const { weekday, day } = dayHeadingParts(date);
          return (
            <a
              key={date}
              href={`#${dayId(date)}`}
              aria-current={date === today ? "date" : undefined}
              // Shown before the link scrolls, or there is nothing to scroll to.
              onClick={foldedDays.includes(date) ? () => flushSync(onUnfold) : undefined}
            >
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
  earlier,
  foldedDays,
  onEarlierToggle,
  addingOn,
  onAdd,
  onEdit,
}: {
  week: Week;
  days: string[];
  today: string;
  meals: PlannerMeal[];
  pickers: Pickers;
  earlier: string[];
  foldedDays: string[];
  onEarlierToggle: () => void;
  addingOn: string | null;
  onAdd: (date: string) => void;
  onEdit: (mealId: string) => void;
}) {
  return (
    <div role="tabpanel" id="planner-days" aria-labelledby={`planner-tab-${week}`} className="planner-days">
      {earlier.length > 0 && (
        <EarlierRow
          days={earlier}
          today={today}
          meals={meals.filter((meal) => earlier.includes(meal.date))}
          open={foldedDays.length === 0}
          onToggle={onEarlierToggle}
        />
      )}
      {days.map((date) => (
        <PlannerDay
          key={date}
          date={date}
          today={today}
          meals={sortMeals(meals.filter((meal) => meal.date === date))}
          pickers={pickers}
          folded={foldedDays.includes(date)}
          adding={addingOn === date}
          onAdd={() => onAdd(date)}
          onEdit={onEdit}
        />
      ))}
    </div>
  );
}

// On phone, this week's days before today, folded into one row so the
// Planner opens on today. A tap opens them above today and another folds
// them. Desktop shows every day as a column, so it has no row.
function EarlierRow({
  days,
  today,
  meals,
  open,
  onToggle,
}: {
  days: string[];
  today: string;
  meals: PlannerMeal[];
  open: boolean;
  onToggle: () => void;
}) {
  const unconfirmed = meals.filter((meal) => isUnconfirmed(meal, today)).length;
  const first = formatDayHeading(days[0]!);
  const last = formatDayHeading(days.at(-1)!);
  const range = days.length === 1 ? first : t("planner.earlierDays", { first, last });
  return (
    <button
      type="button"
      className="planner-earlier phone-only"
      aria-expanded={open}
      aria-controls={days.map(dayId).join(" ")}
      onClick={onToggle}
    >
      <span className="planner-earlier-text">
        <strong>{t("planner.earlier", { days: range })}</strong>
        <span className="planner-earlier-counts">
          {formatMealCount(meals.length)}
          {unconfirmed > 0 && (
            <>
              {t("planner.earlierUnconfirmedPrefix")}
              <span className="planner-earlier-unconfirmed">
                <UnconfirmedIcon />
                {t("planner.unconfirmedCount", { count: unconfirmed })}
              </span>
            </>
          )}
        </span>
      </span>
      <svg className="planner-earlier-chevron" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );
}

function PlannerDay({
  date,
  today,
  meals,
  pickers,
  folded,
  adding,
  onAdd,
  onEdit,
}: {
  date: string;
  today: string;
  meals: PlannerMeal[];
  pickers: Pickers;
  folded: boolean;
  adding: boolean;
  onAdd: () => void;
  onEdit: (mealId: string) => void;
}) {
  const isToday = date === today;
  const longHeading = formatLongDayHeading(date);
  return (
    <section
      id={dayId(date)}
      className={`planner-day${isToday ? " planner-day-today" : ""}${folded ? " planner-day-folded" : ""}`}
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
          aria-expanded={adding}
          onClick={onAdd}
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
              <MealCard meal={meal} today={today} pickers={pickers} onEdit={() => onEdit(meal.id)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Adding a Meal in the side panel, on `date`. With Meal Templates it starts
// on Add a Meal, offering one of them or starting from scratch; without, it
// starts on New Meal. Closing it without adding discards what was typed
// quietly.
export function AddMealPanel({
  date,
  week,
  pickers,
  onClose,
}: {
  date: string;
  week: Week;
  pickers: Pickers;
  onClose: () => void;
}) {
  const [step, setStep] = useState<AddMealStep>(pickers.templates.length > 0 ? "start" : "scratch");
  const [addingSlot, setAddingSlot] = useState<AddingSlot | null>(null);
  return (
    <AddMealPanelView
      date={date}
      week={week}
      pickers={pickers}
      step={step}
      onStep={setStep}
      addingSlot={addingSlot}
      onAddingSlot={setAddingSlot}
      onClose={onClose}
    />
  );
}

// What the panel shows: Add a Meal, New Meal from scratch, or New Meal from
// the picked Meal Template.
export type AddMealStep = "start" | "scratch" | { template: TemplateOption };

// Add a slot, open in place of New Meal: its screen, and what takes the slot
// on New Meal once it is picked.
export type AddingSlot = { screen: AddSlotScreen; deliver: (slot: NewMealSlotInput) => void };

export function AddMealPanelView({
  date,
  week,
  pickers,
  step,
  onStep,
  addingSlot,
  onAddingSlot,
  onClose,
}: {
  date: string;
  week: Week;
  pickers: Pickers;
  step: AddMealStep;
  onStep: (step: AddMealStep) => void;
  addingSlot: AddingSlot | null;
  onAddingSlot: (addingSlot: AddingSlot | null) => void;
  onClose: () => void;
}) {
  const template = typeof step === "object" ? step.template : undefined;
  const title =
    step === "start"
      ? t("planner.panel.startTitle")
      : template
        ? t("planner.panel.newFromTemplateTitle", { template: template.label })
        : t("planner.panel.newTitle");
  const back = () => onAddingSlot(null);
  return (
    <SidePanel
      {...(addingSlot
        ? {
            back: { label: t("planner.picker.backTo", { meal: title }), onBack: back },
            title: addSlotTitle(addingSlot.screen),
            screen: `addSlot-${addingSlot.screen.kind}`,
          }
        : { icon: <MealPanelIcon />, label: mealPanelLabel(date, week, "adding"), title })}
      className={mealPanelClass(week)}
      onClose={onClose}
    >
      {addingSlot && (
        <AddSlotBody
          pickers={pickers}
          screen={addingSlot.screen}
          onScreen={(screen) => onAddingSlot({ ...addingSlot, screen })}
          add={addToMealForm(pickers, addingSlot.deliver)}
          onDone={back}
        />
      )}
      {step === "start" ? (
        <AddMealStart
          templates={pickers.templates}
          onTemplate={(picked) => onStep({ template: picked })}
          onFromScratch={() => onStep("scratch")}
        />
      ) : (
        // The same element either way, so New Meal isn't mounted again and
        // keeps what was typed while a slot is added.
        <div className="meal-panel-content" hidden={addingSlot !== null}>
          <AddMealForm
            date={date}
            pickers={pickers}
            template={template}
            onAddSlot={(deliver) => onAddingSlot({ screen: { kind: "food" }, deliver })}
            onDone={onClose}
          />
        </div>
      )}
    </SidePanel>
  );
}

// Add a Meal: the Meal Templates grouped by Meal Type, in the order
// `templates` comes in, then Start from scratch.
function AddMealStart({
  templates,
  onTemplate,
  onFromScratch,
}: {
  templates: TemplateOption[];
  onTemplate: (template: TemplateOption) => void;
  onFromScratch: () => void;
}) {
  const groups = Map.groupBy(templates, (template) => template.mealType.id);
  return (
    <div className="form-cards">
      <FormCard title={t("planner.fromTemplate")} hint={t("planner.fromTemplateHint")} className="meal-start">
        {[...groups.values()].map((group) => (
          <Fragment key={group[0]!.mealType.id}>
            <h4 className="meal-start-group">{group[0]!.mealType.label}</h4>
            <ul className="meal-start-list">
              {group.map((template) => (
                <li key={template.id}>
                  <button type="button" className="meal-start-option" onClick={() => onTemplate(template)}>
                    <span className="meal-start-option-text">
                      <span className="meal-start-template-head">
                        <strong>{template.label}</strong>
                        <span className="meal-start-template-meta">
                          {t("planner.templateLine", { hour: template.hour, slots: formatSlotCount(template.slots.length) })}
                        </span>
                      </span>
                      {template.slots.length > 0 && (
                        <span className="meal-start-pills">
                          {template.slots.map((slot, index) => (
                            <FoodCategoryPill key={index} label={slot.label} archived={slot.archived} />
                          ))}
                        </span>
                      )}
                    </span>
                    <ChevronIcon />
                  </button>
                </li>
              ))}
            </ul>
          </Fragment>
        ))}
      </FormCard>
      <button type="button" className="card meal-start-option meal-start-scratch" onClick={onFromScratch}>
        <span className="meal-start-scratch-icon">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
        <span className="meal-start-option-text">
          <strong>{t("planner.fromScratch")}</strong>
          <span className="field-hint">{t("planner.fromScratchHint")}</span>
        </span>
        <ChevronIcon />
      </button>
    </div>
  );
}

// New Meal, from scratch or filled in from `template` with its name, Meal
// Type, hour and empty slots, all of which can still change before it is
// added. The Meal keeps no link to the template.
function AddMealForm({
  date,
  pickers,
  template,
  onAddSlot,
  onDone,
}: {
  date: string;
  pickers: Pickers;
  template?: TemplateOption;
  onAddSlot: (deliver: (slot: NewMealSlotInput) => void) => void;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(
    async ({ submits, ...previous }: Submitted<NewMealFormState>, formData: FormData) => {
      const next = await createMealAction(date, previous, formData);
      if (next.errors.length === 0 && next.slotErrors.length === 0) onDone();
      return { ...next, submits: submits + 1 };
    },
    { errors: [], slotErrors: [], values: template ? valuesFrom(template) : NO_VALUES, submits: 0 },
  );
  // An Archived Meal Type is offered only as the template's, which the Meal
  // keeps unless another is picked.
  const mealTypes = template?.mealType.archived ? [...pickers.mealTypes, template.mealType] : pickers.mealTypes;
  const copied = template && template.slots.length > 0;
  return (
    <form action={action} className="form-cards" noValidate>
      <MealFormFields
        key={state.submits}
        errors={state.errors}
        slotErrors={state.slotErrors}
        values={state.values}
        mealTypes={mealTypes}
        mealTypeHint={template && t("planner.mealTypeFromTemplate", { template: template.label })}
        slotsCard={
          <NewMealSlotsCard
            pickers={pickers}
            archivedCategories={pickers.archivedSlotCategories}
            initial={state.values.slots}
            errors={state.slotErrors}
            hint={copied ? t("planner.slotsFromTemplate", { template: template.label }) : undefined}
            onAddSlot={onAddSlot}
          />
        }
      />
      <MealPanelActions submitLabel={t("planner.panel.addMeal")} pending={pending} onCancel={onDone} />
    </form>
  );
}

const NO_VALUES: NewMealFormValues = { mealTypeId: "", hour: "", name: "", untracked: false, slots: [] };

// New Meal filled in from a Meal Template: its slots empty, with no food.
function valuesFrom(template: TemplateOption): NewMealFormValues {
  return {
    mealTypeId: template.mealType.id,
    hour: template.hour,
    name: template.label,
    untracked: false,
    slots: template.slots.map(({ slotCategoryId }) => ({ food: "", amount: "", slotCategoryId })),
  };
}
