"use client";

import { useActionState, useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import {
  asksForAnotherFood,
  asksWhichMeals,
  blockedByArchivedFood,
  canChangeMeal,
  canReopen,
  canConfirmOrSkip,
  confirmOrSkipAsksFirst,
  isUnconfirmed,
  mealCardStatus,
  reopensAs,
  slotFoodValue,
  type MealCardStatus,
  type MealFieldError,
  type MealSlotCategoryError,
  type MealSlotChangeError,
  type MealStatus,
  type NewMealSlotError,
  type NewMealSlotInput,
  type NewMealSlotRowError,
} from "@/core/meals";
import type { CategoryKind } from "@/core/food-categories";
import { WEEKDAYS, type Weekday } from "@/core/meal-series";
import { moveSlot, type SlotMove } from "@/core/slot-order";
import type { AddedBack, ConfirmTakes } from "@/db/confirmation";
import type { MealSeriesState } from "@/db/meals";
import { localDate, localHour, type Week } from "@/core/planner";
import { shortfallUrgency } from "@/core/projected-stock";
import type { DefaultUnit } from "@/core/units";
import {
  formatDayHeading,
  formatList,
  formatMealDate,
  mealPanelLabel,
  formatPortions,
  formatQuantity,
  formatRepeats,
  t,
  weekdayName,
  type StringKey,
} from "@/strings";
import { FORM_LEVEL, MEAL_ERROR_FIELDS } from "../field-errors";
import { FoodCategoryPill } from "../food-category-pill";
import { FormCard } from "../form-card";
import { AlertIcon, FormBanner, FormError, LockIcon, useFieldErrors } from "../form-error";
import { ConfirmSheet, Sheet } from "../sheet";
import { SidePanel } from "../side-panel";
import { useViewerNow, viewerMoment, viewerToday } from "../viewer-clock";
import { AddSlotSheet } from "./add-slot";
import { DeleteMealSheet } from "./delete-meal-sheet";
import { SeriesScopeSheet } from "./series-scope-sheet";
import {
  confirmMealAction,
  editMealAction,
  fillEmptySlotsAction,
  reopenMealAction,
  skipMealAction,
  type ConfirmMealError,
  type MealChangesFormState,
  type SkipMealError,
} from "./actions";
import {
  hasSlotEdits,
  moveShownSlot,
  NO_SLOT_EDITS,
  withSlotRemoved,
  withSlotCategory,
  shownSlots,
  type SlotEdits,
} from "./edit-meal-slots";
import {
  ChevronIcon,
  SlotPickerBody,
  slotPickerHeading,
  SlotPickerSheet,
  startScreen,
  type SlotPickerScreen,
} from "./slot-picker";
import { freshSlotIds, SlotSuggestionBox, usePlannerSuggestions } from "./suggestions";

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
  // Whether the Meal Type allows Leftovers in its slots.
  allowsLeftovers: boolean;
  status: MealStatus;
  untracked: boolean;
  // Its Meal Series' days, Monday first; null if it is in none.
  repeats: Weekday[] | null;
  // When its Meal Series started and whether it ended; null if it is in none.
  series: MealSeriesState | null;
  slots: PlannerMealSlot[];
  // What Reopening it adds back to Stock, by Product name: exactly what its
  // Confirmation took. Empty unless it is Confirmed and took something.
  addsBack: AddedBack[];
  // What Confirming it as planned would take from Stock now, or why Confirm
  // would refuse. Nothing for a Meal that is Untracked, Confirmed or Skipped.
  takes: ConfirmTakes;
}

// A Meal Slot with what its card shows. Its Slot Category may be Archived:
// the slot keeps it until it is changed.
export interface PlannerMealSlot {
  id: string;
  slotCategoryId: string;
  slotCategoryLabel: string;
  slotCategoryArchived: boolean;
  food: PlannerSlotFood;
  // Null when the slot has nothing to warn about, or its Meal is Untracked,
  // Confirmed or Skipped.
  warnings: SlotWarnings | null;
}

// What a slot's warnings show: each Product it is short of by its name, with
// the amount short in its Default Unit, and the names of Products whose
// Ingredient cannot be converted, so their Stock cannot be projected.
export interface SlotWarnings {
  shortfalls: { name: string; amount: number; defaultUnit: DefaultUnit }[];
  unprojectable: string[];
}

// What a Meal Slot holds, as its card shows it. Its Recipe or Product may be
// Archived: the slot keeps it.
export type PlannerSlotFood =
  | { content: "empty" | "leftovers" }
  | { content: "recipe"; id: string; label: string; portions: number; archived: boolean }
  | { content: "product"; id: string; label: string; quantity: number; defaultUnit: DefaultUnit; archived: boolean };

// The non-Archived Recipes and Products a slot's fill picker can offer, each
// with its Food Categories (a Recipe's final ones), by the label the user sees.
export interface SlotFoods {
  recipes: (PickerOption & { portions: number; categoryIds: string[] })[];
  products: (PickerOption & { defaultUnit: DefaultUnit; categoryIds: string[] })[];
}

// A Meal Type, Meal Template or Food Category a picker offers, by the label
// the user sees.
export interface PickerOption {
  id: string;
  label: string;
}

// A Food Category a Slot Category picker offers. Its Role or Kind decides
// whether a slot added by hand can take it.
export interface SlotCategoryOption extends PickerOption {
  kind: CategoryKind;
}

// A Meal Template as Add a Meal offers it, with what New Meal copies from it:
// its name as `label`, hour, Meal Type and its slots' Slot Categories, in
// order. Its Meal Type and Slot Categories may be Archived: a Meal copied
// from it keeps them, unless they are changed on the form.
export interface TemplateOption extends PickerOption {
  hour: string;
  mealType: PickerOption & { archived: boolean };
  slots: { slotCategoryId: string; label: string; archived: boolean }[];
}

// What the planner's pickers offer: Meal Types, Food Categories, Recipes and
// Products that are not Archived, and every Meal Template, by Meal Type.
// `archivedSlotCategories` are the Archived Food Categories a template still
// uses, so a slot copied from it can show its name.
export interface Pickers {
  mealTypes: PickerOption[];
  templates: TemplateOption[];
  slotCategories: SlotCategoryOption[];
  archivedSlotCategories: PickerOption[];
  slotFoods: SlotFoods;
}

// What a slot's picker offers: Slot Categories and food.
export type SlotPickers = Pick<Pickers, "slotCategories" | "slotFoods">;

export type { Week };

// React resets a form after every submit, putting each field back to the value
// it mounted with. Counting submits gives the fields a new key each time, so
// they remount with what was sent and the reset keeps it.
export type Submitted<State> = State & { submits: number };

// A Meal on its day. Its slots are changed in place; `onEdit` opens Edit Meal
// in the side panel. A Confirmed or Skipped Meal is read-only: it can only be
// Reopened.
export function MealCard({
  meal,
  today,
  pickers,
  onEdit,
}: {
  meal: PlannerMeal;
  today: string;
  pickers: SlotPickers;
  onEdit: () => void;
}) {
  const [addingSlot, setAddingSlot] = useState(false);
  const [reopening, setReopening] = useState(false);
  const label = meal.name ?? meal.mealTypeLabel;
  const changeable = canChangeMeal(meal);
  const status = mealCardStatus(meal, today);
  const unconfirmed = isUnconfirmed(meal, today);
  const { bySlot, filled, onFilled } = usePlannerSuggestions();
  const fresh = freshSlotIds(meal, filled);
  // "Use all" once two or more slots have a Suggestion that can go straight
  // in. It is sent every slot with one, so its result can say which were
  // left empty for want of a quantity.
  const suggested = changeable ? meal.slots.filter((slot) => bySlot.has(slot.id)).map((slot) => slot.id) : [];
  const usable = suggested.filter((slotId) => bySlot.get(slotId)![0]!.fill !== null).length;
  const [usingAll, startUsingAll] = useTransition();

  const tint = unconfirmed ? " meal-card-unconfirmed" : meal.status === "skipped" ? " meal-card-skipped" : "";
  return (
    <article className={`meal-card${tint}`}>
      <div className="meal-card-head">
        <div className="meal-card-title">
          <p className="meal-card-eyebrow">{t("planner.mealEyebrow", { mealType: meal.mealTypeLabel, hour: meal.hour })}</p>
          <h3 className="meal-card-name">{label}</h3>
          {meal.repeats && <p className="meal-card-repeats">{formatRepeats(meal.repeats)}</p>}
          {meal.mealTypeArchived && <span className="tag">{t("planner.mealTypeArchived")}</span>}
        </div>
        {status && <MealCardStatusLine status={status} />}
        {changeable && !unconfirmed && (
          <MealMenu meal={meal} label={label} onEdit={onEdit} onAddSlot={() => setAddingSlot(true)} />
        )}
        {canReopen(meal) && (
          <button type="button" className="meal-card-reopen" onClick={() => setReopening(true)}>
            {t("planner.reopen")}
          </button>
        )}
        {reopening && <ReopenSheet meal={meal} today={today} onClose={() => setReopening(false)} />}
      </div>
      {meal.slots.length > 0 && (
        <ol className="slot-list" aria-label={t("planner.slots")}>
          {meal.slots.map((slot) => (
            // Kept across a Slot Category change, so its picker stays open
            // and goes on to the food for the new one.
            <SlotRow
              key={slot.id}
              slot={slot}
              meal={meal}
              today={today}
              changeable={changeable}
              pickers={pickers}
              fresh={fresh.has(slot.id)}
            />
          ))}
        </ol>
      )}
      {usable > 1 && (
        <button
          type="button"
          className="meal-card-use-all"
          disabled={usingAll}
          onClick={() =>
            startUsingAll(async () => {
              onFilled(await fillEmptySlotsAction(suggested, today), false);
            })
          }
        >
          {t("planner.suggestion.useAll", { count: usable })}
        </button>
      )}
      {changeable && (
        <div className="meal-card-foot">
          <button type="button" className="meal-card-add" onClick={() => setAddingSlot(true)}>
            {t("planner.addSlot")}
          </button>
          {canConfirmOrSkip(meal, today) && (
            <ConfirmOrSkipMeal meal={meal} today={today} unconfirmed={unconfirmed} pickers={pickers} />
          )}
        </div>
      )}
      {changeable && addingSlot && <AddSlotSheet meal={meal} pickers={pickers} onClose={() => setAddingSlot(false)} />}
    </article>
  );
}

// ⋯ on a Planned Meal's card, opening what the card doesn't show itself: Edit
// Meal, Add slot and Delete this Meal. It drops under the button on desktop
// and rises from the foot of the screen on phone. Escape, a tap outside or
// picking an item closes it. Delete asks first in a sheet, which stays open
// once the menu has closed. An Unconfirmed Meal gets no menu: it is settled
// by Confirm or Skip.
function MealMenu({
  meal,
  label,
  onEdit,
  onAddSlot,
}: {
  meal: PlannerMeal;
  label: string;
  onEdit: () => void;
  onAddSlot: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    function closeOutside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Handled, so a side panel behind stays open.
      event.preventDefault();
      setOpen(false);
      button.current?.focus();
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  // Focus goes back on ⋯ first, so the delete sheet returns it there.
  const pick = (then: () => void) => () => {
    button.current?.focus();
    setOpen(false);
    then();
  };
  return (
    <div ref={root} className="meal-menu">
      <button
        ref={button}
        type="button"
        className="meal-menu-button"
        aria-label={t("planner.menu.label")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(!open)}
      >
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open && (
        <MealMenuList
          id={menuId}
          meal={meal}
          label={label}
          onEdit={pick(onEdit)}
          onAddSlot={pick(onAddSlot)}
          onDelete={pick(() => setDeleting(true))}
        />
      )}
      {deleting && <DeleteMealSheet meal={meal} label={label} onClose={() => setDeleting(false)} />}
    </div>
  );
}

// The Meal menu's items under "THU 29 · LUNCH · 12:30" and the Meal's name.
export function MealMenuList({
  id,
  meal,
  label,
  onEdit,
  onAddSlot,
  onDelete,
}: {
  id?: string;
  meal: PlannerMeal;
  label: string;
  onEdit: () => void;
  onAddSlot: () => void;
  onDelete: () => void;
}) {
  return (
    <div id={id} role="menu" aria-label={t("planner.menu.label")} className="meal-menu-list">
      <div className="meal-menu-head">
        <p className="meal-menu-eyebrow">
          {t("planner.menu.eyebrow", {
            day: formatDayHeading(meal.date),
            mealType: meal.mealTypeLabel,
            hour: meal.hour,
          })}
        </p>
        <p className="meal-menu-name">{label}</p>
      </div>
      <button type="button" role="menuitem" onClick={onEdit}>
        {t("planner.menu.editMeal")}
      </button>
      <button type="button" role="menuitem" onClick={onAddSlot}>
        {t("planner.menu.addSlot")}
      </button>
      <button type="button" role="menuitem" className="meal-menu-delete" onClick={onDelete}>
        {t("planner.menu.deleteMeal")}
      </button>
    </div>
  );
}

// Asks before Reopening a Confirmed or Skipped Meal, saying where it goes and
// what goes back to Stock: exactly what its Confirmation took, or nothing for
// a Skipped or Untracked one. Cancel changes nothing. `today` is the viewer's
// date.
export function ReopenSheet({ meal, today, onClose }: { meal: PlannerMeal; today: string; onClose: () => void }) {
  const status = mealCardStatus(meal, today);
  return (
    <ConfirmSheet
      eyebrow={mealSheetEyebrow(meal, today)}
      title={t("planner.reopenSheet.title", { name: meal.name ?? meal.mealTypeLabel })}
      confirmLabel={t("planner.reopen")}
      onConfirm={() => reopenMealAction(meal.id)}
      onClose={onClose}
    >
      {status && <MealCardStatusLine status={status} />}
      <ul className="sheet-effects">
        <li className="sheet-effect-back">
          {t(reopensAs(meal, today) === "unconfirmed" ? "planner.reopenSheet.toUnconfirmed" : "planner.reopenSheet.toPlanned")}
        </li>
        {meal.addsBack.length > 0 ? (
          <li className="sheet-effect-add">{t("planner.reopenSheet.addsBack")}</li>
        ) : (
          <li className="sheet-effect-kept">{t(nothingAddedBack(meal))}</li>
        )}
      </ul>
      {meal.addsBack.length > 0 && (
        <div className="reopen-adds-back">
          <p className="reopen-adds-back-label">{t("planner.reopenSheet.addsBackLabel")}</p>
          <dl>
            {meal.addsBack.map(({ name, defaultUnit, quantity }) => (
              <div key={name} className="reopen-adds-back-row">
                <dt>{name}</dt>
                <dd>{t("planner.reopenSheet.addsBackQuantity", { quantity: formatQuantity(quantity, defaultUnit) })}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </ConfirmSheet>
  );
}

// Why a Reopen adds nothing back: Skipped, Confirmed as Untracked, or
// Confirmed with nothing to take.
function nothingAddedBack(meal: PlannerMeal): StringKey {
  if (meal.status === "skipped") return "planner.reopenSheet.nothingSkipped";
  return meal.untracked ? "planner.reopenSheet.nothingUntracked" : "planner.reopenSheet.nothingConfirmed";
}

// "✓ Confirmed", "↗ Confirmed · Untracked", "↗ Untracked", "◷ Unconfirmed",
// "◷ Unconfirmed · Untracked" or "⊘ Skipped": an icon and text, never a pill.
export function MealCardStatusLine({ status }: { status: MealCardStatus }) {
  return (
    <p className={`meal-status meal-status-${status}`}>
      <StatusIcon status={status} />
      {t(`planner.status.${status}`)}
    </p>
  );
}

function StatusIcon({ status }: { status: MealCardStatus }) {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      {STATUS_ICONS[status]}
    </svg>
  );
}

// The clock an Unconfirmed Meal's status shows, for counts of them elsewhere.
export const UnconfirmedIcon = () => <StatusIcon status="unconfirmed" />;

const UNTRACKED_ICON = <path d="M7 17L17 7M8 7h9v9" />;

const UNCONFIRMED_ICON = (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>
);

const STATUS_ICONS: Record<MealCardStatus, ReactNode> = {
  confirmed: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  confirmedUntracked: UNTRACKED_ICON,
  untracked: UNTRACKED_ICON,
  unconfirmed: UNCONFIRMED_ICON,
  unconfirmedUntracked: UNCONFIRMED_ICON,
  skipped: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6l12.8 12.8" />
    </>
  ),
};

export type ConfirmOrSkipError = ConfirmMealError | SkipMealError;

// Confirm, or "Confirm or skip" once the Meal is Unconfirmed, for a Meal dated
// today or earlier. It opens the Confirm sheet, which asks first when the
// Meal is later today: it may not have happened yet.
function ConfirmOrSkipMeal({
  meal,
  today,
  unconfirmed,
  pickers,
}: {
  meal: PlannerMeal;
  today: string;
  unconfirmed: boolean;
  pickers: SlotPickers;
}) {
  // Whether it asks first, worked out from the clock when the sheet opens.
  const [open, setOpen] = useState<{ notYet: boolean } | null>(null);
  return (
    <>
      <button
        type="button"
        className={`${unconfirmed ? "button-warning" : "button-primary"} meal-card-confirm`}
        onClick={() => {
          const now = viewerMoment();
          setOpen({ notYet: confirmOrSkipAsksFirst(meal, { date: localDate(now), hour: localHour(now) }) });
        }}
      >
        {t(unconfirmed ? "planner.confirmOrSkip" : "planner.confirm")}
      </button>
      {open && (
        <ConfirmMealSheet meal={meal} today={today} notYet={open.notYet} pickers={pickers} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

// What happened at a Meal, as the Confirm sheet offers it.
export type ConfirmOutcome = "asPlanned" | "untracked" | "skipped";

const CONFIRM_OUTCOMES: { outcome: ConfirmOutcome; icon: MealCardStatus }[] = [
  { outcome: "asPlanned", icon: "confirmed" },
  { outcome: "untracked", icon: "untracked" },
  { outcome: "skipped", icon: "skipped" },
];

// Confirming a Meal: what was eaten, each slot with Edit, which opens the slot
// picker over the sheet, and what happened: Eaten as planned, "Eaten, but not
// from the Pantry" (Confirmed as Untracked) or Skipped. Skipped hides the
// slots. `notYet` is a Meal later today: the sheet asks first, and its button
// says "anyway". While an Archived Recipe or Product must be changed, both
// Confirm outcomes are off and say why; Skipped still works. A refusal shows
// in red, with nothing written. Cancel changes nothing. `today` is the
// viewer's date.
export function ConfirmMealSheet({
  meal,
  today,
  notYet,
  pickers,
  onClose,
}: {
  meal: PlannerMeal;
  today: string;
  notYet: boolean;
  pickers: SlotPickers;
  onClose: () => void;
}) {
  const [outcome, setOutcome] = useState<ConfirmOutcome>("asPlanned");
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  // Stays until another outcome is picked or a slot is edited, with the
  // button off meanwhile, as retrying unchanged would be refused again.
  const [refused, setRefused] = useState<ConfirmOrSkipError | null>(null);
  const [pending, startTransition] = useTransition();
  const outcomeName = useId();
  const skipping = outcome === "skipped";
  const editingSlot = meal.slots.find((slot) => slot.id === editingSlotId);
  const archivedFoods = meal.slots.filter((slot) => asksForAnotherFood(meal, isArchivedFood(slot.food), today));
  const blocked = !skipping && blockedByArchivedFood(meal, meal.slots.map((slot) => isArchivedFood(slot.food)), today);

  const submit = () =>
    startTransition(async () => {
      const error = skipping
        ? await skipMealAction(meal.id, viewerToday())
        : await confirmMealAction(meal.id, outcome === "untracked", viewerToday());
      if (error) setRefused(error);
      else onClose();
    });

  return (
    <>
      <Sheet
        eyebrow={mealSheetEyebrow(meal, today)}
        title={t("planner.confirmSheet.title", { name: meal.name ?? meal.mealTypeLabel })}
        className="confirm-sheet"
        busy={pending}
        onClose={onClose}
      >
        {!skipping && meal.slots.length > 0 && (
          <div className="confirm-slots">
            <p className="confirm-slots-label">{t("planner.confirmSheet.slotsLabel")}</p>
            <ul className="confirm-slot-list">
              {meal.slots.map((slot) => (
                <ConfirmSlotRow
                  key={slot.id}
                  slot={slot}
                  asksForFood={archivedFoods.includes(slot)}
                  disabled={pending}
                  onEdit={() => setEditingSlotId(slot.id)}
                />
              ))}
            </ul>
          </div>
        )}
        <fieldset className="confirm-outcomes" disabled={pending}>
          <legend className="visually-hidden">{t("planner.confirmSheet.outcomes")}</legend>
          {CONFIRM_OUTCOMES.map(({ outcome: option, icon }) => (
            <label key={option} className="confirm-outcome">
              <input
                type="radio"
                name={outcomeName}
                value={option}
                checked={outcome === option}
                onChange={() => {
                  setOutcome(option);
                  setRefused(null);
                }}
              />
              <span className="confirm-outcome-text">
                <span className="confirm-outcome-name">
                  <StatusIcon status={icon} />
                  {t(`planner.confirmSheet.${option}`)}
                </span>
                <span className="confirm-outcome-hint">{t(`planner.confirmSheet.${option}Hint`)}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <TakesFromStock meal={meal} outcome={outcome} />
        {notYet && !refused && !blocked && (
          <div className="banner">
            <AlertIcon />
            <p>{t(skipping ? "planner.skipToday" : "planner.confirmToday")}</p>
          </div>
        )}
        {blocked && !refused && (
          <div className="banner">
            <AlertIcon />
            <p>{archivedFoodsBanner(archivedFoods)}</p>
          </div>
        )}
        {/* Why, and that nothing was taken, in one message. */}
        {refused && (
          <FormBanner>
            {confirmOrSkipErrorMessage(refused)} {t("planner.confirmSheet.nothingLeft")}
          </FormBanner>
        )}
        <div className="sheet-actions">
          <button type="button" onClick={onClose} disabled={pending}>
            {t("planner.cancel")}
          </button>
          <button type="button" className="button-primary" disabled={pending || refused !== null || blocked} onClick={submit}>
            {t(confirmSheetButton(outcome, notYet))}
          </button>
        </div>
      </Sheet>
      {/* Beside the sheet, not in it, so closing the picker leaves it open. */}
      {editingSlot && (
        <SlotPickerSheet
          meal={meal}
          slot={editingSlot}
          pickers={pickers}
          onClose={() => {
            setEditingSlotId(null);
            setRefused(null);
          }}
        />
      )}
    </>
  );
}

// The Confirm sheet's main button, for what happened: Confirm, "Confirm as
// Untracked" or "Skip Meal", or "Confirm anyway" and "Skip anyway" for a
// Meal later today.
function confirmSheetButton(outcome: ConfirmOutcome, notYet: boolean): StringKey {
  if (outcome === "skipped") return notYet ? "planner.skipAnyway" : "planner.skipMeal";
  if (notYet) return "planner.confirmAnyway";
  return outcome === "untracked" ? "planner.confirmUntracked" : "planner.confirm";
}

// Why Confirm is off: the one Archived Recipe or Product to change, or each.
function archivedFoodsBanner(slots: readonly PlannerMealSlot[]): string {
  if (slots.length > 1) return t("planner.confirmSheet.archivedFoods");
  return t(slots[0]!.food.content === "recipe" ? "planner.confirmSheet.archivedRecipe" : "planner.confirmSheet.archivedProduct");
}

// A slot on the Confirm sheet: its pill and food, its amount, and Edit. An
// empty one says it deducts nothing; one that `asksForFood` asks to pick
// another in place of its Archived Recipe or Product.
function ConfirmSlotRow({
  slot,
  asksForFood,
  disabled,
  onEdit,
}: {
  slot: PlannerMealSlot;
  asksForFood: boolean;
  disabled: boolean;
  onEdit: () => void;
}) {
  const empty = slot.food.content === "empty";
  const showsAmount = slot.food.content === "recipe" || slot.food.content === "product";
  return (
    <li className={empty ? "confirm-slot confirm-slot-empty" : "confirm-slot"}>
      <FoodCategoryPill label={slot.slotCategoryLabel} archived={slot.slotCategoryArchived} />
      <span className="confirm-slot-food">
        {empty ? (
          <>
            <span className="confirm-slot-none">{t("planner.confirmSheet.empty")}</span>
            <span className="confirm-slot-hint">{t("planner.confirmSheet.emptyHint")}</span>
          </>
        ) : (
          <>
            <SlotFoodName food={slot.food} tagsArchived={!asksForFood} />
            {asksForFood && <span className="confirm-slot-note">{archivedFoodNote(slot.food)}</span>}
          </>
        )}
      </span>
      {showsAmount && <span className="confirm-slot-amount">{slotAmount(slot.food)}</span>}
      <button
        type="button"
        className="confirm-slot-edit"
        aria-label={t("planner.confirmSheet.editSlot", { category: slot.slotCategoryLabel })}
        disabled={disabled}
        onClick={onEdit}
      >
        {t("planner.confirmSheet.edit")}
      </button>
    </li>
  );
}

// The Confirm sheet's "Takes from Stock": each Product and "− 300 g", what
// Eaten as planned deducts, in amber with why when Stock is short and the
// deduction clamps at 0. Otherwise it says why nothing leaves Stock: the
// outcome picked, an Untracked Meal, the slots, or the refusal Confirm
// would give.
function TakesFromStock({ meal, outcome }: { meal: PlannerMeal; outcome: ConfirmOutcome }) {
  const listed = outcome === "asPlanned" && !meal.untracked && meal.takes.ok ? meal.takes.products : [];
  return (
    <div className="confirm-takes">
      <p className="confirm-takes-label">{t("planner.confirmSheet.takesLabel")}</p>
      {listed.length > 0 ? (
        <ul className="confirm-take-list">
          {listed.map(({ name, defaultUnit, needs, takes }) => {
            const short = takes < needs;
            return (
              <li key={name} className={short ? "confirm-take confirm-take-short" : "confirm-take"}>
                <span className="confirm-take-name">{name}</span>
                <span className="confirm-take-amount">
                  {t("planner.confirmSheet.takesQuantity", { quantity: formatQuantity(takes, defaultUnit) })}
                </span>
                {short && (
                  <p className="confirm-take-warning">
                    <AlertIcon />
                    {t("planner.confirmSheet.takesShort", {
                      needs: formatQuantity(needs, defaultUnit),
                      stock: formatQuantity(takes, defaultUnit),
                      name,
                      flag: t("stock.suspect"),
                    })}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="confirm-takes-note">{nothingTaken(meal, outcome)}</p>
      )}
    </div>
  );
}

// Why the Confirm sheet's "Takes from Stock" lists nothing.
function nothingTaken(meal: PlannerMeal, outcome: ConfirmOutcome): string {
  if (outcome === "skipped") return t("planner.confirmSheet.takesSkipped");
  if (outcome === "untracked" || meal.untracked) return t("planner.confirmSheet.takesUntracked");
  if (!meal.takes.ok) return confirmOrSkipErrorMessage(meal.takes);
  if (meal.slots.length === 0) return t("planner.confirmSheet.takesNoSlots");
  const empty = meal.slots.filter((slot) => slot.food.content === "empty").map((slot) => slot.slotCategoryLabel);
  // Each once, however many slots hold it.
  const recipes = [...new Set(meal.slots.flatMap(({ food }) => (food.content === "recipe" ? [food.label] : [])))];
  const reasons = [
    ...(meal.slots.some((slot) => slot.food.content === "leftovers") ? [t("planner.confirmSheet.takesLeftovers")] : []),
    ...(empty.length > 0
      ? [t(empty.length === 1 ? "planner.confirmSheet.takesEmptyOne" : "planner.confirmSheet.takesEmptyMany", { categories: formatList(empty) })]
      : []),
    ...(recipes.length > 0
      ? [
          t(recipes.length === 1 ? "planner.confirmSheet.takesNoIngredientsOne" : "planner.confirmSheet.takesNoIngredientsMany", {
            recipes: formatList(recipes),
          }),
        ]
      : []),
  ];
  return t("planner.confirmSheet.takesNothing", { reasons: formatList(reasons) });
}

// "Today · Thu 29 Oct · 12:30" over a sheet about a Meal, or without Today
// on another day.
function mealSheetEyebrow(meal: PlannerMeal, today: string): string {
  return t(meal.date === today ? "planner.mealSheet.eyebrowToday" : "planner.mealSheet.eyebrow", {
    day: formatMealDate(meal.date),
    hour: meal.hour,
  });
}

// "Can't confirm: Flour has no Density, so 1 cup can't be converted to g. ..."
export function confirmOrSkipErrorMessage(error: ConfirmOrSkipError): string {
  if (error.error === "notConfirmable") return t("planner.error.notConfirmable");
  if (error.error === "notSkippable") return t("planner.error.notSkippable");
  if (error.error === "archivedFood") return t("planner.error.archivedFood");
  return t(`planner.error.${error.code}`, {
    product: error.product.name,
    quantity: formatQuantity(error.amount, error.unit),
    defaultUnit: t(`unit.${error.product.defaultUnit}`),
  });
}

// Strips at the foot of a slot: "Short 100 g Spinach", red when the Meal is
// a day away or less, amber otherwise, and a grey "Can't project Olive oil:
// its unit does not convert". They never block saving.
function SlotWarningStrips({ warnings, mealDate, today }: { warnings: SlotWarnings; mealDate: string; today: string }) {
  return (
    <>
      {warnings.shortfalls.length > 0 && (
        <div className={`slot-strip slot-strip-${shortfallUrgency(mealDate, today)}`} role="status">
          {warnings.shortfalls.map(({ name, amount, defaultUnit }) => (
            <p key={name}>
              <AlertIcon />
              {t("planner.shortfall", { quantity: formatQuantity(amount, defaultUnit), name })}
            </p>
          ))}
        </div>
      )}
      {warnings.unprojectable.length > 0 && (
        <div className="slot-strip slot-strip-neutral" role="status">
          {warnings.unprojectable.map((name) => (
            <p key={name}>
              <AlertIcon />
              {t("planner.cannotProject", { name })}
            </p>
          ))}
        </div>
      )}
    </>
  );
}

// A slot on its Meal's card: its Slot Category pill, its Portions or quantity
// and a chevron, over its food. On a Planned Meal a tap opens the slot
// slot picker; a Confirmed or Skipped Meal's slots show as they were. An
// Archived Slot Category is struck through and asks for another, which opens
// the picker on Change Slot Category, since no food can be picked for it.
// An Archived Recipe or Product in a Meal today or later asks for another,
// and a tap still opens the picker on its food.
function SlotRow({
  slot,
  meal,
  today,
  changeable,
  pickers,
  fresh,
}: {
  slot: PlannerMealSlot;
  meal: PlannerMeal;
  today: string;
  changeable: boolean;
  pickers: SlotPickers;
  // Just filled by "Fill empty slots", so it shows highlighted.
  fresh: boolean;
}) {
  // The picker's first screen while it is open.
  const [picking, setPicking] = useState<SlotPickerScreen | null>(null);
  const open = picking !== null;
  const toggle = () => setPicking(open ? null : startScreen(slot));
  const suggestions = usePlannerSuggestions().bySlot.get(slot.id);
  const archived = slot.slotCategoryArchived;
  const asksForCategory = changeable && archived;
  const tappable = changeable && !archived;
  // The category is asked for first: no food can be picked until it changes.
  const asksForFood = !archived && asksForAnotherFood(meal, isArchivedFood(slot.food), today);
  const summary = (
    <SlotSummary slot={slot} showAmount={!asksForCategory} chevron={tappable} tagsArchived={!asksForFood} />
  );
  const dashed = slot.food.content === "empty" || archived || asksForFood;
  const className = `slot-row${dashed ? " slot-row-dashed" : ""}${fresh ? " slot-row-fresh" : ""}`;
  return (
    <li className={className}>
      {tappable ? (
        <button type="button" className="slot-row-main" aria-expanded={open} onClick={toggle}>
          {summary}
        </button>
      ) : (
        <div className="slot-row-main">{summary}</div>
      )}
      {asksForFood && (
        <div className="slot-row-archived">
          <p className="slot-row-archived-note">{archivedFoodNote(slot.food)}</p>
        </div>
      )}
      {asksForCategory && (
        <div className="slot-row-archived">
          <p className="slot-row-archived-note">{t("planner.slotArchived")}</p>
          <button type="button" aria-expanded={open} onClick={toggle}>
            {t("planner.pickAnotherCategory")}
          </button>
        </div>
      )}
      {tappable && slot.food.content === "empty" && suggestions && (
        <SlotSuggestionBox
          slot={slot}
          suggestions={suggestions}
          onAskQuantity={({ content, id }) => setPicking({ kind: "amount", content, id })}
        />
      )}
      {picking && (
        <SlotPickerSheet
          meal={meal}
          slot={slot}
          pickers={pickers}
          start={picking}
          onClose={() => setPicking(null)}
        />
      )}
      {slot.warnings && <SlotWarningStrips warnings={slot.warnings} mealDate={meal.date} today={today} />}
    </li>
  );
}

// A slot's Slot Category pill, with its Portions or quantity and a chevron
// beside it when shown, over its food, tagged Archived if `tagsArchived`.
function SlotSummary({
  slot,
  showAmount,
  chevron,
  tagsArchived = true,
}: {
  slot: PlannerMealSlot;
  showAmount: boolean;
  chevron: boolean;
  tagsArchived?: boolean;
}) {
  return (
    <>
      <span className="slot-row-top">
        <FoodCategoryPill label={slot.slotCategoryLabel} archived={slot.slotCategoryArchived} />
        {showAmount && (
          <span className="slot-row-end">
            <span className="slot-row-amount">{slotAmount(slot.food)}</span>
            {chevron && <ChevronIcon />}
          </span>
        )}
      </span>
      <SlotFoodName food={slot.food} tagsArchived={tagsArchived} />
    </>
  );
}

// Whether a slot holds a Recipe or Product that was Archived since.
function isArchivedFood(food: PlannerSlotFood): boolean {
  return (food.content === "recipe" || food.content === "product") && food.archived;
}

// "Recipe archived - pick another" or "Product archived - pick another".
function archivedFoodNote(food: PlannerSlotFood): string {
  return t(food.content === "recipe" ? "planner.recipeArchived" : "planner.productArchived");
}

// "2 portions", "250 g", "Deducts nothing" or "Not chosen yet" beside the pill.
export function slotAmount(food: PlannerSlotFood): string {
  switch (food.content) {
    case "recipe":
      return formatPortions(food.portions);
    case "product":
      return formatQuantity(food.quantity, food.defaultUnit);
    case "leftovers":
      return t("planner.deductsNothing");
    case "empty":
      return t("planner.notChosen");
  }
}

// What a slot holds, under its pill. A Recipe or Product removed since stays,
// tagged Archived unless `tagsArchived` is false, where a note says so instead.
export function SlotFoodName({ food, tagsArchived = true }: { food: PlannerSlotFood; tagsArchived?: boolean }) {
  switch (food.content) {
    case "empty":
      return null;
    case "leftovers":
      return <span className="slot-row-food">{t("planner.leftovers")}</span>;
    case "recipe":
    case "product":
      return (
        <span className="slot-row-food">
          {food.label}
          {food.archived && tagsArchived && <span className="planner-tag">{t("planner.foodArchived")}</span>}
        </span>
      );
  }
}

// The Meal form's added slots, each sent under these same names in the order
// shown. createMealAction reads them.
const MEAL_FORM_SLOT_FIELDS = { food: "slotFood", amount: "slotAmount", slotCategoryId: "slotCategoryId" };

// A slot on the Meal form, as its row shows it: its Slot Category and what it
// holds, which is empty if it was copied from a Meal Template or its Recipe or
// Product is no longer offered. A copied one may keep an Archived Slot
// Category, one of `archivedCategories`. It isn't saved yet, so it has no
// warnings.
function draftSlot(
  key: string,
  input: NewMealSlotInput,
  { slotFoods, slotCategories }: SlotPickers,
  archivedCategories: PickerOption[],
): PlannerMealSlot {
  const category = slotCategories.find((option) => option.id === input.slotCategoryId);
  const archived = category ? undefined : archivedCategories.find((option) => option.id === input.slotCategoryId);
  return {
    id: key,
    slotCategoryId: input.slotCategoryId,
    slotCategoryLabel: (category ?? archived)?.label ?? "",
    slotCategoryArchived: archived !== undefined,
    food: draftFood(input, slotFoods),
    warnings: null,
  };
}

function draftFood(input: NewMealSlotInput, slotFoods: SlotFoods): PlannerSlotFood {
  const amount = Number(input.amount);
  const recipe = slotFoods.recipes.find((option) => slotFoodValue("recipe", option.id) === input.food);
  if (recipe) return { content: "recipe", id: recipe.id, label: recipe.label, portions: amount, archived: false };
  const product = slotFoods.products.find((option) => slotFoodValue("product", option.id) === input.food);
  if (product) {
    const { id, label, defaultUnit } = product;
    return { content: "product", id, label, quantity: amount, defaultUnit, archived: false };
  }
  return { content: "empty" };
}

// "Slot 2 (Rice): Enter a quantity above 0.", or without the food when it is
// no longer offered.
function slotErrorMessage(row: number, food: PlannerSlotFood, error: NewMealSlotError | MealSlotCategoryError): string {
  const reason = t(`planner.error.${error}`);
  return "label" in food
    ? t("planner.error.slot", { row, food: food.label, reason })
    : t("planner.error.slotNoFood", { row, reason });
}

// A slot on the Meal form, with the key its row keeps when others are
// removed, and why it was refused, if it was.
type FormSlot = { key: number; input: NewMealSlotInput; error?: NewMealSlotError };

// New Meal's Slots card: the empty slots copied from a Meal Template, with
// no food, and the ones added here. Each can be removed with ×, and is sent
// with the form in the order shown, under the same three names. `errors`
// count rows from 1, and each shows under its slot. Mounted again on every
// submit, so it starts from `initial`, what was sent. `hint` says where the
// slots came from. Add slot calls `onAddSlot` with what takes the slot once
// it is picked, as the panel shows the picking steps in the card's place.
export function NewMealSlotsCard({
  pickers,
  archivedCategories = [],
  initial = [],
  errors = [],
  hint = t("planner.slotsHint"),
  onAddSlot,
}: {
  pickers: SlotPickers;
  archivedCategories?: PickerOption[];
  initial?: NewMealSlotInput[];
  errors?: NewMealSlotRowError[];
  hint?: string;
  onAddSlot: (add: (slot: NewMealSlotInput) => void) => void;
}) {
  const [slots, setSlots] = useState<FormSlot[]>(() =>
    initial.map((input, index) => ({
      key: index,
      input,
      error: errors.find((error) => error.row === index + 1)?.code,
    })),
  );
  const nextKey = useRef(initial.length);
  const names = MEAL_FORM_SLOT_FIELDS;
  const { list, focusAfterMove } = useMoveFocus(slots.map((slot) => String(slot.key)));

  return (
    <FormCard title={t("planner.slots")} hint={hint}>
      {slots.length > 0 && (
        <ol ref={list} className="slot-list">
          {slots.map(({ key, input, error }, index) => {
            const slot = draftSlot(String(key), input, pickers, archivedCategories);
            const empty = slot.food.content === "empty" && !input.food;
            return (
              <li
                key={key}
                className={`slot-row${empty ? " slot-row-dashed" : ""} meal-form-slot meal-form-slot-removable`}
              >
                <div className="slot-row-main">
                  <SlotSummary slot={slot} showAmount chevron={false} />
                  {/* On the food's line, as the design has it: ▲ ▼ × take the top.
                      An empty slot has nothing to pick on the form yet. */}
                  {!empty && <ChevronIcon />}
                </div>
                <SlotTools
                  slotKey={String(key)}
                  category={slot.slotCategoryLabel}
                  index={index}
                  count={slots.length}
                  onMove={(offset) => {
                    focusAfterMove(String(key), index + offset);
                    setSlots(moveSlot(slots, index, offset));
                  }}
                >
                  <button
                    type="button"
                    className="meal-form-slot-remove"
                    aria-label={t("planner.newMeal.removeSlot", { category: slot.slotCategoryLabel })}
                    onClick={() => setSlots(slots.filter((slot) => slot.key !== key))}
                  >
                    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </SlotTools>
                <input type="hidden" name={names.food} value={input.food} />
                <input type="hidden" name={names.amount} value={input.amount} />
                <input type="hidden" name={names.slotCategoryId} value={input.slotCategoryId} />
                {error && <FormError>{slotErrorMessage(index + 1, slot.food, error)}</FormError>}
              </li>
            );
          })}
        </ol>
      )}
      <button
        type="button"
        className="meal-form-add-slot"
        onClick={() =>
          onAddSlot((input) => {
            const key = nextKey.current++;
            setSlots((shown) => [...shown, { key, input }]);
          })
        }
      >
        <span className="meal-form-add-slot-icon">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
        {t("planner.newMeal.addSlot")}
      </button>
    </FormCard>
  );
}

// ▲ and ▼ at the top right of a slot on the Meal form, named for its Slot
// Category, then `children`: New Meal's ×. The first slot's ▲ and the last
// slot's ▼ are disabled.
function SlotTools({
  slotKey,
  category,
  index,
  count,
  onMove,
  children,
}: {
  slotKey: string;
  category: string;
  index: number;
  count: number;
  onMove: (offset: SlotMove) => void;
  children?: ReactNode;
}) {
  return (
    <div className="meal-form-slot-tools">
      <button
        type="button"
        data-move={`${slotKey}:-1`}
        aria-label={t("planner.moveSlotUp", { category })}
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 5l9 14H3z" />
        </svg>
      </button>
      <button
        type="button"
        data-move={`${slotKey}:1`}
        aria-label={t("planner.moveSlotDown", { category })}
        disabled={index === count - 1}
        onClick={() => onMove(1)}
      >
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 19L3 5h18z" />
        </svg>
      </button>
      {children}
    </div>
  );
}

// Keeps the focus on a moved slot's ▲ or ▼ once its row is in its new place,
// or on the other one when that is now disabled. `keys` are the slots in the
// order shown; `focusAfterMove` takes the slot and the place it is going to.
function useMoveFocus(keys: readonly string[]) {
  const list = useRef<HTMLOListElement>(null);
  const pending = useRef<{ key: string; to: number; offset: SlotMove } | null>(null);
  useEffect(() => {
    const move = pending.current;
    if (!move || keys.indexOf(move.key) !== move.to) return;
    pending.current = null;
    const button = (offset: SlotMove) =>
      list.current?.querySelector<HTMLButtonElement>(`[data-move="${CSS.escape(`${move.key}:${offset}`)}"]`);
    const pressed = button(move.offset);
    (pressed && !pressed.disabled ? pressed : button(move.offset === -1 ? 1 : -1))?.focus();
  });
  const focusAfterMove = (key: string, to: number) => {
    pending.current = { key, to, offset: to < keys.indexOf(key) ? -1 : 1 };
  };
  return { list, focusAfterMove };
}

// Edit Meal's slots, as changed on the form. A tap opens the slot picker when
// `onPickSlot` is given, and ▲ or ▼ moves the slot on the form when
// `onMoveSlot` is. `slotErrors` are the slots Save refused, under their row.
function EditMealSlotList({
  slots,
  slotErrors = [],
  onPickSlot,
  onMoveSlot,
}: {
  slots: PlannerMealSlot[];
  slotErrors?: MealSlotChangeError[];
  onPickSlot?: (slot: PlannerMealSlot) => void;
  onMoveSlot?: (index: number, offset: SlotMove) => void;
}) {
  const { list, focusAfterMove } = useMoveFocus(slots.map((slot) => slot.id));
  return (
    <ol ref={list} className="slot-list">
      {slots.map((slot, index) => {
        const empty = slot.food.content === "empty";
        const dashed = empty || slot.slotCategoryArchived;
        // On the food's line, as on New Meal. An empty slot has none, so its
        // chevron stays by "Not chosen yet", clear of ▲ ▼.
        const chevron = onPickSlot !== undefined && !slot.slotCategoryArchived;
        const summary = <SlotSummary slot={slot} showAmount chevron={chevron && empty} />;
        const error = slotErrors.find((refused) => refused.slotId === slot.id);
        return (
          <li
            key={slot.id}
            className={`slot-row${dashed ? " slot-row-dashed" : ""}${onMoveSlot ? " meal-form-slot" : ""}`}
          >
            {onPickSlot ? (
              <button type="button" className="slot-row-main" onClick={() => onPickSlot(slot)}>
                {summary}
                {chevron && !empty && <ChevronIcon />}
              </button>
            ) : (
              <div className="slot-row-main">{summary}</div>
            )}
            {onMoveSlot && (
              <SlotTools
                slotKey={slot.id}
                category={slot.slotCategoryLabel}
                index={index}
                count={slots.length}
                onMove={(offset) => {
                  focusAfterMove(slot.id, index + offset);
                  onMoveSlot(index, offset);
                }}
              />
            )}
            {error && <FormError>{slotErrorMessage(index + 1, slot.food, error.code)}</FormError>}
          </li>
        );
      })}
    </ol>
  );
}

// The class giving a Meal panel its week's accent: blue for next week.
export function mealPanelClass(week: Week): string {
  return week === "next" ? "meal-panel meal-panel-next" : "meal-panel";
}

// The day a Meal panel adds to or edits, before its label.
export function MealPanelIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

// Cancel and the main button at the foot of a Meal panel's form.
export function MealPanelActions({
  submitLabel,
  pending,
  onCancel,
}: {
  submitLabel: string;
  pending: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="form-actions">
      <button type="button" onClick={onCancel}>
        {t("planner.cancel")}
      </button>
      <button type="submit" className="button-primary" disabled={pending}>
        {submitLabel}
      </button>
    </div>
  );
}

// Edit Meal in the side panel, on a Planned Meal. Its Meal Type is shown but
// never changes. Closing it without saving discards the changes quietly.
export function EditMealPanel({
  meal,
  week,
  pickers,
  onClose,
}: {
  meal: PlannerMeal;
  week: Week;
  pickers: SlotPickers;
  onClose: () => void;
}) {
  const [picking, setPicking] = useState<SlotPicking | null>(null);
  const [slotEdits, setSlotEdits] = useState(NO_SLOT_EDITS);
  return (
    <EditMealPanelView
      meal={meal}
      week={week}
      pickers={pickers}
      picking={picking}
      onPicking={setPicking}
      slotEdits={slotEdits}
      onSlotEdits={setSlotEdits}
      onClose={onClose}
    />
  );
}

// A slot of the Meal being picked for, and the picker's screen.
export type SlotPicking = { slotId: string; screen: SlotPickerScreen };

// Edit Meal, or the slot picker for one of its slots in its place, headed
// "Back to {Meal}": nothing stacks on top of the panel. The form stays
// mounted, hidden, so what was typed in it is still there on the way back. A
// slot removed meanwhile, or on the form, goes back to the form. The slots
// show `slotEdits`, kept until Save; the picker's Remove Slot and Change
// Slot Category add to them, while its food is written straight away.
export function EditMealPanelView({
  meal,
  week,
  pickers,
  picking,
  onPicking,
  slotEdits,
  onSlotEdits,
  onClose,
}: {
  meal: PlannerMeal;
  week: Week;
  pickers: SlotPickers;
  picking: SlotPicking | null;
  onPicking: (picking: SlotPicking | null) => void;
  slotEdits: SlotEdits;
  onSlotEdits: (edits: SlotEdits) => void;
  onClose: () => void;
}) {
  const label = meal.name ?? meal.mealTypeLabel;
  const slots = shownSlots(meal.slots, slotEdits, pickers.slotCategories);
  const pickedSlot = picking ? slots.find((slot) => slot.id === picking.slotId) : undefined;
  const back = () => onPicking(null);
  const mealFormAndDelete = (
    <>
      <EditMealForm
        meal={meal}
        slots={slots}
        slotEdits={slotEdits}
        onMoveSlot={(index, offset) => onSlotEdits(moveShownSlot(slotEdits, slots, index, offset))}
        onPickSlot={(slot) => onPicking({ slotId: slot.id, screen: startScreen(slot) })}
        onDone={onClose}
      />
      <DeleteMealCard meal={meal} label={label} onDeleted={onClose} />
    </>
  );
  return (
    <SidePanel
      className={mealPanelClass(week)}
      onClose={onClose}
      {...(picking && pickedSlot
        ? {
            ...slotPickerHeading(meal, pickedSlot, picking.screen),
            back: { label: t("planner.picker.backTo", { meal: label }), onBack: back },
          }
        : {
            icon: <MealPanelIcon />,
            label: mealPanelLabel(meal.date, week, "editing"),
            title: t("planner.panel.editTitle", { name: label }),
          })}
    >
      {picking && pickedSlot && (
        <SlotPickerBody
          meal={meal}
          slot={pickedSlot}
          pickers={pickers}
          screen={picking.screen}
          onScreen={(screen) => onPicking({ slotId: pickedSlot.id, screen })}
          onDone={back}
          keptUntilSave={{
            setSlotCategory: (slotCategoryId) => onSlotEdits(withSlotCategory(slotEdits, pickedSlot.id, slotCategoryId)),
            remove: () => {
              onSlotEdits(withSlotRemoved(slotEdits, pickedSlot.id));
              back();
            },
          }}
        />
      )}
      {/* The same element either way, so the form isn't mounted again. */}
      <div className="meal-panel-content" hidden={pickedSlot !== undefined}>
        {mealFormAndDelete}
      </div>
    </SidePanel>
  );
}

// The values a Meal form shows, kept as sent when a submit is rejected. Only
// adding has a Meal Type to pick.
export interface MealFormValues {
  mealTypeId?: string;
  hour: string;
  name: string;
  untracked: boolean;
  // The slots added while adding.
  slots?: NewMealSlotInput[];
  // "Repeat on": each ticked weekday's number.
  repeatOn: string[];
}

// What "Repeat on" can do on a Meal form: nothing on a Meal dated before the
// viewer's date (`past`), and nothing on Edit Meal for a Meal of a Meal
// Series that ended (`locked`), which shows its series' days. On a Meal of a
// series still repeating, `seriesStartedOn` is the day it started.
export interface RepeatOnState {
  past: boolean;
  locked: boolean;
  seriesStartedOn?: string;
}

// Whether a Meal on `date` is before the viewer's date, so it can't repeat.
// Not yet known before hydration, when it is taken as today.
export function useIsPastDay(date: string): boolean {
  const now = useViewerNow();
  return now !== null && date < now.date;
}

// A Meal form's action, sent the viewer's date as they submitted: "Repeat
// on" is checked against it.
export function withViewerToday<State>(action: (state: State, formData: FormData) => Promise<State>) {
  return (state: State, formData: FormData) => {
    formData.set("today", viewerToday());
    return action(state, formData);
  };
}

// The Meal form's cards, without its buttons: Basics, Slots, and Tracking and
// repeat, under a banner counting the errors once a submit is rejected.
// Adding offers `mealTypes` as chips, with `mealTypeHint` under them, and
// shows `slotsCard`, its NewMealSlotsCard, whose refused slots `slotErrors`
// holds; `editing` shows its Meal Type locked and lists its slots, as
// changed on the form, with the ones Save refused in `editSlotErrors`.
// Mounted again on every submit, so it starts from what was sent.
export function MealFormFields({
  errors,
  slotErrors = [],
  editSlotErrors = [],
  values,
  repeat,
  mealTypes,
  mealTypeHint = t("planner.mealTypeHint"),
  slotsCard,
  editing,
  onPickSlot,
  onMoveSlot,
}: {
  errors: MealFieldError[];
  slotErrors?: NewMealSlotRowError[];
  editSlotErrors?: MealSlotChangeError[];
  values: MealFormValues;
  repeat: RepeatOnState;
  mealTypes: PickerOption[];
  mealTypeHint?: string;
  slotsCard?: ReactNode;
  editing?: Pick<PlannerMeal, "mealTypeLabel" | "slots">;
  // Opens the slot picker for a slot of the Meal being edited.
  onPickSlot?: (slot: PlannerMealSlot) => void;
  // Moves the slot at `index` of the Meal being edited one place up (-1) or
  // down (1) on the form.
  onMoveSlot?: (index: number, offset: SlotMove) => void;
}) {
  const [picked, setPicked] = useState(values.mealTypeId ?? "");
  const { invalid, messages } = useMealErrors(errors);
  const mealType = editing?.mealTypeLabel ?? mealTypes.find((option) => option.id === picked)?.label;

  return (
    <>
      <MealFormBanner count={errors.length + slotErrors.length + editSlotErrors.length} editing={editing !== undefined} />
      {messages(FORM_LEVEL)}
      <FormCard title={t("planner.basics")}>
        {editing ? (
          <div className="form-field">
            <span className="form-field-label">{t("planner.mealType")}</span>
            <span className="field-locked">
              <LockIcon />
              {editing.mealTypeLabel}
            </span>
            <p className="field-hint">{t("planner.mealTypeLocked")}</p>
          </div>
        ) : (
          <fieldset className="form-field">
            <legend>{t("planner.mealType")}</legend>
            <div className="chips">
              {mealTypes.map((option) => (
                <label key={option.id} className="chip meal-type-chip">
                  <input
                    type="radio"
                    name="mealTypeId"
                    value={option.id}
                    defaultChecked={option.id === picked}
                    onChange={() => setPicked(option.id)}
                    {...invalid("mealType")}
                  />
                  {option.label}
                </label>
              ))}
            </div>
            {/* The error takes the hint's place. */}
            {messages("mealType") ?? <p className="field-hint">{mealTypeHint}</p>}
          </fieldset>
        )}
        <div className="form-field">
          <div className="meal-form-row">
            <label className="form-field">
              {t("planner.hour")}
              <input
                name="hour"
                defaultValue={values.hour}
                placeholder={t("planner.hourPlaceholder")}
                autoComplete="off"
                autoFocus={editing !== undefined}
                {...invalid("hour")}
              />
            </label>
            <label className="form-field">
              <span>
                {t("planner.nameLabel")}
                <span className="form-field-optional">{t("planner.optional")}</span>
              </span>
              <input
                name="name"
                defaultValue={values.name}
                placeholder={
                  mealType ? t("planner.namePlaceholder", { mealType }) : t("planner.namePlaceholderNoMealType")
                }
              />
            </label>
          </div>
          {messages("hour")}
        </div>
      </FormCard>
      {editing ? (
        <FormCard title={t("planner.slots")}>
          {editing.slots.length > 0 ? (
            <EditMealSlotList slots={editing.slots} slotErrors={editSlotErrors} onPickSlot={onPickSlot} onMoveSlot={onMoveSlot} />
          ) : (
            <p className="meal-form-no-slots">{t("planner.noSlots")}</p>
          )}
        </FormCard>
      ) : (
        slotsCard
      )}
      <FormCard title={t("planner.trackingAndRepeat")}>
        <UntrackedSwitch untracked={values.untracked} />
        <RepeatOn ticked={values.repeatOn} {...repeat} invalid={invalid("repeatOn")} message={messages("repeatOn")} />
      </FormCard>
    </>
  );
}

// Untracked as a switch: a checkbox named by "Untracked", with what it means
// under it. The whole row is its label, so a tap anywhere on it flips it.
function UntrackedSwitch({ untracked }: { untracked: boolean }) {
  const id = useId();
  return (
    <label className="meal-form-switch">
      <span id={`${id}-name`} className="meal-form-switch-name">
        <StatusIcon status="untracked" />
        {t("planner.untracked")}
      </span>
      <span id={`${id}-hint`} className="field-hint">
        {t("planner.untrackedHint")}
      </span>
      <input
        type="checkbox"
        role="switch"
        name="untracked"
        defaultChecked={untracked}
        aria-labelledby={`${id}-name`}
        aria-describedby={`${id}-hint`}
      />
    </label>
  );
}

// "Repeat on": the seven weekdays as tick boxes, Monday first. None is no
// repeat, one is weekly, all seven is daily. On a past Meal they show
// disabled, with why; on a Meal of a Meal Series that ended, its days,
// disabled. On a Meal of a series still repeating, the hint says how a
// change applies. An error takes the hint's place.
function RepeatOn({
  ticked,
  past,
  locked,
  seriesStartedOn,
  invalid,
  message,
}: RepeatOnState & {
  ticked: string[];
  invalid: object;
  message: ReactNode;
}) {
  const disabled = past || locked;
  return (
    <fieldset className="form-field meal-form-repeat" disabled={disabled}>
      <legend>{t("planner.repeatOn")}</legend>
      <div className="chips">
        {WEEKDAYS.map((weekday) => (
          <label key={weekday} className="chip repeat-day-chip">
            <input
              type="checkbox"
              name="repeatOn"
              value={weekday}
              defaultChecked={ticked.includes(String(weekday))}
              {...invalid}
            />
            {weekdayName(weekday)}
          </label>
        ))}
      </div>
      {message ??
        (past ? (
          <p className="field-hint">{t("planner.repeatOnPast")}</p>
        ) : seriesStartedOn !== undefined ? (
          <p className="field-hint">{t("planner.repeatOnSeries", { date: formatMealDate(seriesStartedOn) })}</p>
        ) : (
          !locked && <p className="field-hint">{t("planner.repeatOnHint")}</p>
        ))}
    </fieldset>
  );
}

// Over a Meal form once a submit is rejected: "Fix 2 things to add this
// Meal. They're marked in red below." `count` is every error, the refused
// slots' too; none shows nothing. The buttons are below the fields, so it
// scrolls back up to it. Mounted again on every submit, as the form is.
function MealFormBanner({ count, editing = false }: { count: number; editing?: boolean }) {
  const banner = useRef<HTMLDivElement>(null);
  useEffect(() => {
    banner.current?.scrollIntoView({ block: "nearest" });
  }, []);
  if (count === 0) return null;
  return (
    <FormBanner ref={banner}>
      <FixMessage count={count} editing={editing} />
    </FormBanner>
  );
}

// "Fix 2 things to add this Meal. They're marked in red below."
function FixMessage({ count, editing }: { count: number; editing: boolean }) {
  return count === 1 ? (
    <>
      <strong>{t(editing ? "planner.fixToSaveOne" : "planner.fixToAddOne")}</strong> {t("planner.fixWhereOne")}
    </>
  ) : (
    <>
      <strong>{t(editing ? "planner.fixToSave" : "planner.fixToAdd", { count })}</strong> {t("planner.fixWhere")}
    </>
  );
}

// `slots` are the Meal's as changed on the form. Once `slotEdits` changed
// them, Save sends their order, the ones removed and the new Slot Categories
// only, so a slot added, removed or given a Slot Category elsewhere meanwhile
// keeps that change. On a Meal of a Meal Series, a changed hour, name,
// Untracked or slots first asks which Meals it applies to (core's
// asksWhichMeals), then submits with the answer.
function EditMealForm({
  meal,
  slots,
  slotEdits,
  onMoveSlot,
  onPickSlot,
  onDone,
}: {
  meal: PlannerMeal;
  slots: PlannerMealSlot[];
  slotEdits: SlotEdits;
  onMoveSlot: (index: number, offset: SlotMove) => void;
  onPickSlot: (slot: PlannerMealSlot) => void;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(
    withViewerToday(async ({ submits, ...previous }: Submitted<MealChangesFormState>, formData: FormData) => {
      const next = await editMealAction(meal.id, previous, formData);
      if (next.errors.length === 0 && next.slotErrors.length === 0) onDone();
      return { ...next, submits: submits + 1 };
    }),
    {
      errors: [],
      slotErrors: [],
      values: {
        hour: meal.hour,
        name: meal.name ?? "",
        untracked: meal.untracked,
        repeatOn: (meal.repeats ?? []).map(String),
      },
      submits: 0,
    },
  );
  const past = useIsPastDay(meal.date);
  const form = useRef<HTMLFormElement>(null);
  const seriesScope = useRef<HTMLInputElement>(null);
  const answered = useRef(false);
  const [asking, setAsking] = useState(false);
  return (
    <>
      <form
        ref={form}
        action={action}
        className="form-cards"
        noValidate
        onSubmit={(event) => {
          if (answered.current) {
            answered.current = false;
            return;
          }
          if (seriesScope.current) seriesScope.current.value = "this";
          const data = new FormData(event.currentTarget);
          const input = {
            hour: String(data.get("hour") ?? ""),
            name: String(data.get("name") ?? ""),
            untracked: data.get("untracked") === "on",
            slots,
          };
          if (asksWhichMeals(meal, input)) {
            event.preventDefault();
            setAsking(true);
          }
        }}
      >
        <MealFormFields
          key={state.submits}
          errors={state.errors}
          editSlotErrors={state.slotErrors}
          values={state.values}
          repeat={{
            past,
            locked: meal.series?.ended === true,
            seriesStartedOn: meal.series && !meal.series.ended ? meal.series.startedOn : undefined,
          }}
          mealTypes={[]}
          editing={{ mealTypeLabel: meal.mealTypeLabel, slots }}
          onPickSlot={onPickSlot}
          onMoveSlot={onMoveSlot}
        />
        {hasSlotEdits(slotEdits) && (
          <>
            {slots.map((slot) => (
              <input key={slot.id} type="hidden" name="slotOrder" value={slot.id} />
            ))}
            {slotEdits.removed.map((slotId) => (
              <input key={slotId} type="hidden" name="removedSlotId" value={slotId} />
            ))}
            {slots
              .filter((slot) => slot.id in slotEdits.slotCategories)
              .flatMap((slot) => [
                <input key={`${slot.id}:id`} type="hidden" name="changedSlotId" value={slot.id} />,
                <input key={`${slot.id}:category`} type="hidden" name="changedSlotCategoryId" value={slot.slotCategoryId} />,
              ])}
          </>
        )}
        {meal.repeats !== null && <input ref={seriesScope} type="hidden" name="seriesScope" defaultValue="this" />}
        <MealPanelActions submitLabel={t("planner.save")} pending={pending} onCancel={onDone} />
      </form>
      {/* Outside the form, so its choices aren't sent with it. */}
      {asking && meal.repeats !== null && (
        <SeriesScopeSheet
          kind="change"
          meal={{ date: meal.date, repeats: meal.repeats }}
          label={meal.name ?? meal.mealTypeLabel}
          onPick={(scope) => {
            if (seriesScope.current) seriesScope.current.value = scope;
            answered.current = true;
            form.current?.requestSubmit();
          }}
          onClose={() => setAsking(false)}
        />
      )}
    </>
  );
}

// The foot of Edit Meal. Delete asks first in a sheet, which Meals for a
// Meal of a Meal Series.
function DeleteMealCard({ meal, label, onDeleted }: { meal: PlannerMeal; label: string; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false);
  return (
    <section className="card meal-panel-delete">
      <h3>{t("planner.panel.delete")}</h3>
      <p>{t("planner.panel.deleteBody")}</p>
      <button type="button" className="button-danger" onClick={() => setDeleting(true)}>
        {t("planner.menu.deleteMeal")}
      </button>
      {deleting && (
        <DeleteMealSheet meal={meal} label={label} onDeleted={onDeleted} onClose={() => setDeleting(false)} />
      )}
    </section>
  );
}

export function useMealErrors(errors: MealFieldError[]) {
  return useFieldErrors(
    errors,
    (error) => MEAL_ERROR_FIELDS[error],
    (error) => t(`planner.error.${error}`),
  );
}
