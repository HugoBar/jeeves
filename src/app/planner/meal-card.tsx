"use client";

import { Fragment, useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  canChangeMeal,
  canReopen,
  canConfirmOrSkip,
  confirmOrSkipAsksFirst,
  isUnconfirmed,
  mealCardStatus,
  newMealSlotPickable,
  parseNewMealSlot,
  reopensAs,
  slotCategoryChoices,
  slotFoodValue,
  type MealCardStatus,
  type MealFieldError,
  type MealStatus,
  type NewMealSlotError,
  type NewMealSlotInput,
  type NewMealSlotRowError,
} from "@/core/meals";
import type { CategoryKind } from "@/core/food-categories";
import type { AddedBack } from "@/db/confirmation";
import { localDate, localHour, type Week } from "@/core/planner";
import { shortfallUrgency } from "@/core/projected-stock";
import type { DefaultUnit } from "@/core/units";
import { formatDayHeading, formatMealDate, mealPanelLabel, formatPortions, formatQuantity, t, type StringKey } from "@/strings";
import { FORM_LEVEL, MEAL_ERROR_FIELDS } from "../field-errors";
import { FoodCategoryPill } from "../food-category-pill";
import { FormCard } from "../form-card";
import { AlertIcon, FormBanner, FormError, LockIcon, useFieldErrors, type InvalidProps } from "../form-error";
import { ConfirmSheet } from "../sheet";
import { SidePanel } from "../side-panel";
import { viewerToday } from "../viewer-clock";
import {
  addMealSlotAction,
  confirmMealAction,
  editMealAction,
  removeMealAction,
  reopenMealAction,
  skipMealAction,
  type ConfirmMealError,
  type MealChangesFormState,
  type NewMealSlotFormState,
  type SkipMealError,
} from "./actions";
import {
  ChevronIcon,
  SlotPickerBody,
  slotPickerHeading,
  SlotPickerSheet,
  startScreen,
  useSlotErrors,
  type SlotPickerScreen,
} from "./slot-picker";

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
  slots: PlannerMealSlot[];
  // What Reopening it adds back to Stock, by Product name: exactly what its
  // Confirmation took. Empty unless it is Confirmed and took something.
  addsBack: AddedBack[];
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

// A Meal named with its date, as lists across days show it: "Mon 26 Oct · Lunch".
export function mealOnLabel(meal: Pick<PlannerMeal, "date" | "name" | "mealTypeLabel">): string {
  return t("unconfirmed.mealOn", { day: formatMealDate(meal.date), name: meal.name ?? meal.mealTypeLabel });
}

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

  const tint = unconfirmed ? " meal-card-unconfirmed" : meal.status === "skipped" ? " meal-card-skipped" : "";
  return (
    <article className={`meal-card${tint}`}>
      <div className="meal-card-head">
        <div className="meal-card-title">
          <p className="meal-card-eyebrow">{t("planner.mealEyebrow", { mealType: meal.mealTypeLabel, hour: meal.hour })}</p>
          <h3 className="meal-card-name">{label}</h3>
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
            />
          ))}
        </ol>
      )}
      {changeable &&
        (addingSlot ? (
          <AddSlotForm
            mealId={meal.id}
            foods={pickers.slotFoods}
            slotCategories={pickers.slotCategories}
            onDone={() => setAddingSlot(false)}
          />
        ) : (
          <div className="meal-card-foot">
            <button type="button" className="meal-card-add" onClick={() => setAddingSlot(true)}>
              {t("planner.addSlot")}
            </button>
            {canConfirmOrSkip(meal, today) && <ConfirmOrSkipMeal meal={meal} unconfirmed={unconfirmed} />}
          </div>
        ))}
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
      {deleting && (
        <ConfirmSheet
          title={t("sheet.deleteTitle", { name: label })}
          confirmLabel={t("sheet.delete")}
          destructive
          onConfirm={() => removeMealAction(meal.id)}
          onClose={() => setDeleting(false)}
        />
      )}
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
  const day = formatMealDate(meal.date);
  return (
    <ConfirmSheet
      eyebrow={t(meal.date === today ? "planner.reopenSheet.eyebrowToday" : "planner.reopenSheet.eyebrow", {
        day,
        hour: meal.hour,
      })}
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
function MealCardStatusLine({ status }: { status: MealCardStatus }) {
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

type ConfirmOrSkipError = ConfirmMealError | SkipMealError;

// What each of the form's buttons sends as "outcome".
const OUTCOME = { confirm: "confirm", confirmUntracked: "confirmUntracked", skip: "skip" } as const;

// Confirm, or "Confirm or skip" once the Meal is Unconfirmed, for a Meal dated
// today or earlier. It opens the three outcomes: Confirm, Confirm as
// Untracked and Skip. A Meal later today may not have happened yet, so each
// asks first in a sheet, holding what was submitted until it is answered;
// cancelling sends nothing. An Untracked Meal deducts nothing either way. A
// refusal shows here, with nothing written.
function ConfirmOrSkipMeal({ meal, unconfirmed }: { meal: PlannerMeal; unconfirmed: boolean }) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState<FormData | null>(null);
  const [error, action, pending] = useActionState(
    (_previous: ConfirmOrSkipError | null, formData: FormData): Promise<ConfirmOrSkipError | null> => {
      const outcome = formData.get("outcome");
      if (outcome === OUTCOME.skip) return skipMealAction(meal.id, viewerToday());
      return confirmMealAction(meal.id, outcome === OUTCOME.confirmUntracked, viewerToday());
    },
    null,
  );
  const skipping = asking?.get("outcome") === OUTCOME.skip;
  const name = meal.name ?? meal.mealTypeLabel;
  if (!open) {
    return (
      <button
        type="button"
        className={`${unconfirmed ? "button-warning" : "button-primary"} meal-card-confirm`}
        onClick={() => setOpen(true)}
      >
        {t(unconfirmed ? "planner.confirmOrSkip" : "planner.confirm")}
      </button>
    );
  }
  return (
    <>
      <form
        action={action}
        className="planner-confirm"
        onSubmit={(event) => {
          const now = new Date();
          if (!confirmOrSkipAsksFirst(meal, { date: localDate(now), hour: localHour(now) })) return;
          event.preventDefault();
          setAsking(new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter));
        }}
      >
        <button type="submit" name="outcome" value={OUTCOME.confirm} className="button-primary" disabled={pending}>
          {t("planner.confirm")}
        </button>
        <button type="submit" name="outcome" value={OUTCOME.confirmUntracked} disabled={pending}>
          {t("planner.confirmUntracked")}
        </button>
        <button type="submit" name="outcome" value={OUTCOME.skip} disabled={pending}>
          {t("planner.skip")}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={pending}>
          {t("planner.cancel")}
        </button>
        {error && <FormError>{confirmOrSkipErrorMessage(error)}</FormError>}
      </form>
      {asking && (
        <ConfirmSheet
          title={t(skipping ? "planner.skipTodayTitle" : "planner.confirmTodayTitle", { name })}
          confirmLabel={t(skipping ? "planner.skipAnyway" : "planner.confirmAnyway")}
          onConfirm={() => action(asking)}
          onClose={() => setAsking(null)}
        >
          <p className="banner">{t(skipping ? "planner.skipToday" : "planner.confirmToday")}</p>
        </ConfirmSheet>
      )}
    </>
  );
}

// "Can't confirm: Flour has no Density, so 1 cup can't be converted to g. ..."
export function confirmOrSkipErrorMessage(error: ConfirmOrSkipError): string {
  if (error.error === "notConfirmable") return t("planner.error.notConfirmable");
  if (error.error === "notSkippable") return t("planner.error.notSkippable");
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
function SlotRow({
  slot,
  meal,
  today,
  changeable,
  pickers,
}: {
  slot: PlannerMealSlot;
  meal: PlannerMeal;
  today: string;
  changeable: boolean;
  pickers: SlotPickers;
}) {
  const [open, setOpen] = useState(false);
  const archived = slot.slotCategoryArchived;
  const asksForCategory = changeable && archived;
  const tappable = changeable && !archived;
  const summary = <SlotSummary slot={slot} showAmount={!asksForCategory} chevron={tappable} />;
  const dashed = slot.food.content === "empty" || archived;
  return (
    <li className={dashed ? "slot-row slot-row-dashed" : "slot-row"}>
      {tappable ? (
        <button type="button" className="slot-row-main" aria-expanded={open} onClick={() => setOpen(!open)}>
          {summary}
        </button>
      ) : (
        <div className="slot-row-main">{summary}</div>
      )}
      {asksForCategory && (
        <div className="slot-row-archived">
          <p className="slot-row-archived-note">{t("planner.slotArchived")}</p>
          <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
            {t("planner.pickAnotherCategory")}
          </button>
        </div>
      )}
      {open && (
        <SlotPickerSheet
          meal={meal}
          slot={slot}
          pickers={pickers}
          onClose={() => setOpen(false)}
        />
      )}
      {slot.warnings && <SlotWarningStrips warnings={slot.warnings} mealDate={meal.date} today={today} />}
    </li>
  );
}

// A slot's Slot Category pill, with its Portions or quantity and a chevron
// beside it when shown, over its food.
function SlotSummary({ slot, showAmount, chevron }: { slot: PlannerMealSlot; showAmount: boolean; chevron: boolean }) {
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
      <SlotFoodName food={slot.food} />
    </>
  );
}

// "2 portions", "250 g", "Deducts nothing" or "Not chosen yet" beside the pill.
function slotAmount(food: PlannerSlotFood): string {
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
// tagged Archived.
function SlotFoodName({ food }: { food: PlannerSlotFood }) {
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
          {food.archived && <span className="planner-tag">{t("planner.foodArchived")}</span>}
        </span>
      );
  }
}

// A picked Recipe or Product and its Portions or quantity, as the food
// picker's fields hold them.
type FoodValues = { food: string; amount: string };

// The names a slot's picking fields are sent under.
export interface SlotFieldNames {
  food: string;
  amount: string;
  slotCategoryId: string;
}

// The planner's slot forms, which each send one slot.
const SLOT_FORM_FIELDS: SlotFieldNames = { food: "food", amount: "amount", slotCategoryId: "slotCategoryId" };

// The Meal form's added slots, each sent under these same names in the order
// shown. createMealAction reads them.
const MEAL_FORM_SLOT_FIELDS: SlotFieldNames = {
  food: "slotFood",
  amount: "slotAmount",
  slotCategoryId: "slotCategoryId",
};

// The food picker and its amount, shared by filling a slot and adding one.
// Picking a Recipe sets the Portions to the Recipe's own, which can then be
// changed. `emptyLabel` is the picker's blank first option. Nothing is sent
// until something is picked.
function FoodFields({
  recipes,
  products,
  allowsLeftovers,
  emptyLabel,
  values,
  onChange,
  invalid,
  fieldNames = SLOT_FORM_FIELDS,
}: {
  recipes: SlotFoods["recipes"];
  products: SlotFoods["products"];
  allowsLeftovers: boolean;
  emptyLabel: string;
  values: FoodValues;
  onChange: (values: FoodValues) => void;
  invalid: (field: "food" | "amount") => InvalidProps;
  fieldNames?: SlotFieldNames;
}) {
  const recipeFor = (food: string) => recipes.find((option) => slotFoodValue("recipe", option.id) === food);
  const recipe = recipeFor(values.food);
  const product = products.find((option) => slotFoodValue("product", option.id) === values.food);
  function pick(food: string) {
    const picked = recipeFor(food);
    onChange({ food, amount: picked ? String(picked.portions) : "" });
  }

  return (
    <>
      <select
        name={values.food ? fieldNames.food : undefined}
        aria-label={t("planner.food")}
        value={values.food}
        onChange={(event) => pick(event.target.value)}
        autoFocus
        {...invalid("food")}
      >
        <option value="">{emptyLabel}</option>
        {recipes.length > 0 && (
          <optgroup label={t("planner.recipes")}>
            {recipes.map((option) => (
              <option key={option.id} value={slotFoodValue("recipe", option.id)}>
                {option.label}
              </option>
            ))}
          </optgroup>
        )}
        {products.length > 0 && (
          <optgroup label={t("planner.products")}>
            {products.map((option) => (
              <option key={option.id} value={slotFoodValue("product", option.id)}>
                {option.label}
              </option>
            ))}
          </optgroup>
        )}
        {allowsLeftovers && <option value="leftovers">{t("planner.leftovers")}</option>}
      </select>
      {(recipe || product) && (
        <label className="planner-amount">
          <input
            name={fieldNames.amount}
            inputMode={recipe ? "numeric" : "decimal"}
            value={values.amount}
            onChange={(event) => onChange({ ...values, amount: event.target.value })}
            required
            {...invalid("amount")}
          />
          {recipe ? t("planner.portions") : t(`unit.${product!.defaultUnit}`)}
        </label>
      )}
    </>
  );
}

// Adds a slot filled with a non-Archived Recipe or Product, after the Meal's
// others. The slot takes its Role, else its Kind; with several, a chooser
// shows with the first pre-selected. A Recipe or Product with no Food
// Category cannot be added. Leftovers are not offered: they have no Food
// Category to give the slot. Unmounted when closed, so its errors go with it.
function AddSlotForm({
  mealId,
  foods,
  slotCategories,
  onDone,
}: {
  mealId: string;
  foods: SlotFoods;
  slotCategories: SlotCategoryOption[];
  onDone: () => void;
}) {
  // Controlled, so a rejected submit keeps what was picked and typed.
  const [values, setValues] = useState<NewMealSlotInput>(NO_NEW_SLOT);
  const [state, action, pending] = useActionState(async (previous: NewMealSlotFormState, formData: FormData) => {
    const next = await addMealSlotAction(mealId, previous, formData);
    if (!next.error) onDone();
    return next;
  }, { error: null });
  const { uncategorised } = slotChoicesFor(values.food, { slotFoods: foods, slotCategories });
  const { invalid, allMessages } = useSlotErrors(uncategorised ? "uncategorisedFood" : state.error);

  return (
    <form action={action} className="item-form planner-form open-row">
      <AddSlotFields
        pickers={{ slotFoods: foods, slotCategories }}
        values={values}
        onChange={setValues}
        invalid={invalid}
      />
      <button type="submit" className="button-primary" disabled={pending || uncategorised}>
        {t("planner.add")}
      </button>
      <button type="button" onClick={onDone}>
        {t("planner.cancel")}
      </button>
      {allMessages()}
    </form>
  );
}

// A slot added by hand before anything is picked for it.
const NO_NEW_SLOT: NewMealSlotInput = { food: "", amount: "", slotCategoryId: "" };

// The Recipe or Product picked for a slot added by hand, and the Slot
// Categories it can give the slot: its Roles, else its Kinds. With none it
// can't be added.
function slotChoicesFor(food: string, { slotFoods, slotCategories }: SlotPickers) {
  const picked =
    slotFoods.recipes.find((option) => slotFoodValue("recipe", option.id) === food) ??
    slotFoods.products.find((option) => slotFoodValue("product", option.id) === food);
  const choices = picked ? slotCategoryChoices(picked.categoryIds, slotCategories) : [];
  return { picked, choices, uncategorised: picked !== undefined && choices.length === 0 };
}

// The picking steps of adding a slot by hand, on the planner or on the Meal
// form: any non-Archived Recipe or Product and its amount, then its Slot
// Category, with a chooser when it can take several, the first pre-selected.
// Leftovers are not offered: they have no Food Category to give the slot.
function AddSlotFields({
  pickers,
  values,
  onChange,
  invalid,
  fieldNames = SLOT_FORM_FIELDS,
}: {
  pickers: SlotPickers;
  values: NewMealSlotInput;
  onChange: (values: NewMealSlotInput) => void;
  invalid: (field: "food" | "amount" | "slotCategory") => InvalidProps;
  fieldNames?: SlotFieldNames;
}) {
  const { choices } = slotChoicesFor(values.food, pickers);
  return (
    <>
      <FoodFields
        recipes={pickers.slotFoods.recipes}
        products={pickers.slotFoods.products}
        allowsLeftovers={false}
        emptyLabel={t("planner.pickFood")}
        values={values}
        // Other food pre-selects its own first Slot Category.
        onChange={(next) => onChange({ ...next, slotCategoryId: next.food === values.food ? values.slotCategoryId : "" })}
        invalid={invalid}
        fieldNames={fieldNames}
      />
      {choices.length === 1 && <input type="hidden" name={fieldNames.slotCategoryId} value={choices[0]!.id} />}
      {choices.length > 1 && (
        <select
          name={fieldNames.slotCategoryId}
          aria-label={t("planner.slotCategory")}
          value={values.slotCategoryId || choices[0]!.id}
          onChange={(event) => onChange({ ...values, slotCategoryId: event.target.value })}
          {...invalid("slotCategory")}
        >
          {choices.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </select>
      )}
    </>
  );
}

// Adds a slot on the Meal form, before the Meal exists, with the same steps
// as adding one on the planner. It sits inside the Meal form, so its buttons
// don't submit it; Enter adds the slot too. It is checked here as the server
// will check it, and handed over with its Slot Category and amount as they
// were read. Its fields are sent as the last added slot, so saving the Meal
// while it is open keeps what was picked rather than dropping it.
function NewSlotPicker({
  pickers,
  onAdd,
  onCancel,
}: {
  pickers: SlotPickers;
  onAdd: (slot: NewMealSlotInput) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<NewMealSlotInput>(NO_NEW_SLOT);
  const [error, setError] = useState<NewMealSlotError | null>(null);
  const { uncategorised } = slotChoicesFor(values.food, pickers);
  const { invalid, allMessages } = useSlotErrors(uncategorised ? "uncategorisedFood" : error);

  function add() {
    const { slotFoods, slotCategories } = pickers;
    const parsed = parseNewMealSlot(
      values,
      newMealSlotPickable(slotFoods.recipes, slotFoods.products, slotCategories),
    );
    if (!parsed.ok) return setError(parsed.error);
    const { slotCategoryId, fill } = parsed.slot;
    onAdd({ food: values.food, amount: String(fill.content === "recipe" ? fill.portions : fill.quantity), slotCategoryId });
  }

  return (
    <div
      className="item-form planner-form open-row"
      onKeyDown={(event) => {
        if (event.key !== "Enter" || !(event.target instanceof HTMLInputElement)) return;
        event.preventDefault();
        add();
      }}
    >
      <AddSlotFields
        pickers={pickers}
        values={values}
        onChange={(next) => {
          setError(null);
          setValues(next);
        }}
        invalid={invalid}
        fieldNames={MEAL_FORM_SLOT_FIELDS}
      />
      <button type="button" className="button-primary" disabled={uncategorised} onClick={add}>
        {t("planner.add")}
      </button>
      <button type="button" onClick={onCancel}>
        {t("planner.cancel")}
      </button>
      {allMessages()}
    </div>
  );
}

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
function slotErrorMessage(row: number, food: PlannerSlotFood, error: NewMealSlotError): string {
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
// slots came from.
export function NewMealSlotsCard({
  pickers,
  archivedCategories = [],
  initial = [],
  errors = [],
  hint = t("planner.slotsHint"),
}: {
  pickers: SlotPickers;
  archivedCategories?: PickerOption[];
  initial?: NewMealSlotInput[];
  errors?: NewMealSlotRowError[];
  hint?: string;
}) {
  const [slots, setSlots] = useState<FormSlot[]>(() =>
    initial.map((input, index) => ({
      key: index,
      input,
      error: errors.find((error) => error.row === index + 1)?.code,
    })),
  );
  const nextKey = useRef(initial.length);
  const [adding, setAdding] = useState(false);
  const names = MEAL_FORM_SLOT_FIELDS;

  return (
    <FormCard title={t("planner.slots")} hint={hint}>
      {slots.length > 0 && (
        <ol className="slot-list">
          {slots.map(({ key, input, error }, index) => {
            const slot = draftSlot(String(key), input, pickers, archivedCategories);
            const empty = slot.food.content === "empty" && !input.food;
            return (
              <li key={key} className={empty ? "slot-row slot-row-dashed meal-form-slot" : "slot-row meal-form-slot"}>
                <div className="slot-row-main">
                  <SlotSummary slot={slot} showAmount chevron={false} />
                  {/* On the food's line, as the design has it: × takes the top.
                      An empty slot has nothing to pick on the form yet. */}
                  {!empty && <ChevronIcon />}
                </div>
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
                <input type="hidden" name={names.food} value={input.food} />
                <input type="hidden" name={names.amount} value={input.amount} />
                <input type="hidden" name={names.slotCategoryId} value={input.slotCategoryId} />
                {error && <FormError>{slotErrorMessage(index + 1, slot.food, error)}</FormError>}
              </li>
            );
          })}
        </ol>
      )}
      {adding ? (
        <NewSlotPicker
          pickers={pickers}
          onAdd={(input) => {
            setSlots([...slots, { key: nextKey.current++, input }]);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button type="button" className="meal-form-add-slot" onClick={() => setAdding(true)}>
          <span className="meal-form-add-slot-icon">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          {t("planner.newMeal.addSlot")}
        </button>
      )}
    </FormCard>
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
  return (
    <EditMealPanelView
      meal={meal}
      week={week}
      pickers={pickers}
      picking={picking}
      onPicking={setPicking}
      onClose={onClose}
    />
  );
}

// A slot of the Meal being picked for, and the picker's screen.
export type SlotPicking = { slotId: string; screen: SlotPickerScreen };

// Edit Meal, or the slot picker for one of its slots in its place, headed
// "Back to {Meal}": nothing stacks on top of the panel. The form stays
// mounted, hidden, so what was typed in it is still there on the way back. A
// slot removed meanwhile goes back to the form.
export function EditMealPanelView({
  meal,
  week,
  pickers,
  picking,
  onPicking,
  onClose,
}: {
  meal: PlannerMeal;
  week: Week;
  pickers: SlotPickers;
  picking: SlotPicking | null;
  onPicking: (picking: SlotPicking | null) => void;
  onClose: () => void;
}) {
  const label = meal.name ?? meal.mealTypeLabel;
  const pickedSlot = picking ? meal.slots.find((slot) => slot.id === picking.slotId) : undefined;
  const back = () => onPicking(null);
  const mealFormAndDelete = (
    <>
      <EditMealForm
        meal={meal}
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
}

// The Meal form's cards, without its buttons: Basics, Slots, and Tracking and
// repeat, under a banner counting the errors once a submit is rejected.
// Adding offers `mealTypes` as chips, with `mealTypeHint` under them, and
// shows `slotsCard`, its NewMealSlotsCard, whose refused slots `slotErrors`
// holds; `editing` shows its Meal Type locked and lists its slots. Mounted
// again on every submit, so it starts from what was sent.
export function MealFormFields({
  errors,
  slotErrors = [],
  values,
  mealTypes,
  mealTypeHint = t("planner.mealTypeHint"),
  slotsCard,
  editing,
  onPickSlot,
}: {
  errors: MealFieldError[];
  slotErrors?: NewMealSlotRowError[];
  values: MealFormValues;
  mealTypes: PickerOption[];
  mealTypeHint?: string;
  slotsCard?: ReactNode;
  editing?: Pick<PlannerMeal, "mealTypeLabel" | "slots">;
  // Opens the slot picker for a slot of the Meal being edited.
  onPickSlot?: (slot: PlannerMealSlot) => void;
}) {
  const [picked, setPicked] = useState(values.mealTypeId ?? "");
  const { invalid, messages } = useMealErrors(errors);
  const mealType = editing?.mealTypeLabel ?? mealTypes.find((option) => option.id === picked)?.label;

  return (
    <>
      <MealFormBanner count={errors.length + slotErrors.length} editing={editing !== undefined} />
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
            <ol className="slot-list">
              {editing.slots.map((slot) => (
                <li
                  key={slot.id}
                  className={slot.food.content === "empty" || slot.slotCategoryArchived ? "slot-row slot-row-dashed" : "slot-row"}
                >
                  {onPickSlot ? (
                    <button type="button" className="slot-row-main" onClick={() => onPickSlot(slot)}>
                      <SlotSummary slot={slot} showAmount chevron={!slot.slotCategoryArchived} />
                    </button>
                  ) : (
                    <div className="slot-row-main">
                      <SlotSummary slot={slot} showAmount chevron={false} />
                    </div>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="meal-form-no-slots">{t("planner.noSlots")}</p>
          )}
        </FormCard>
      ) : (
        slotsCard
      )}
      <FormCard title={t("planner.trackingAndRepeat")}>
        <UntrackedSwitch untracked={values.untracked} />
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

function EditMealForm({
  meal,
  onPickSlot,
  onDone,
}: {
  meal: PlannerMeal;
  onPickSlot: (slot: PlannerMealSlot) => void;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(
    async ({ submits, ...previous }: Submitted<MealChangesFormState>, formData: FormData) => {
      const next = await editMealAction(meal.id, previous, formData);
      if (next.errors.length === 0) onDone();
      return { ...next, submits: submits + 1 };
    },
    { errors: [], values: { hour: meal.hour, name: meal.name ?? "", untracked: meal.untracked }, submits: 0 },
  );
  return (
    <form action={action} className="form-cards" noValidate>
      <MealFormFields
        key={state.submits}
        errors={state.errors}
        values={state.values}
        mealTypes={[]}
        editing={meal}
        onPickSlot={onPickSlot}
      />
      <MealPanelActions submitLabel={t("planner.save")} pending={pending} onCancel={onDone} />
    </form>
  );
}

// The foot of Edit Meal. Delete asks first in a sheet.
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
        <ConfirmSheet
          title={t("sheet.deleteTitle", { name: label })}
          confirmLabel={t("sheet.delete")}
          destructive
          onConfirm={async () => {
            await removeMealAction(meal.id);
            onDeleted();
          }}
          onClose={() => setDeleting(false)}
        />
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
