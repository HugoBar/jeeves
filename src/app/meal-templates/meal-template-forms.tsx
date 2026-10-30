"use client";

import { useActionState, useState } from "react";
import { moveSlot, type MealTemplateContent } from "@/core/meal-templates";
import { t } from "@/strings";
import { groupCategoriesByKind } from "../categories/category-groups";
import type { CategoryOption } from "../categories/category-options";
import { MEAL_TEMPLATE_ERROR_FIELDS, templateSlotErrorField } from "../field-errors";
import { FoodCategoryPill } from "../food-category-pill";
import { useFieldErrors, type InvalidProps } from "../form-error";
import { EditableRow } from "../list-row";
import { RemoveButton } from "../remove-button";
import {
  createMealTemplateAction,
  editMealTemplateAction,
  removeMealTemplateAction,
  type MealTemplateFormState,
} from "./actions";


// A Meal Type as the picker offers it, by the label the user sees. An
// Archived one is offered only to the template that already has it.
export interface MealTypeOption {
  id: string;
  label: string;
  archived: boolean;
}

// A Food Category a slot can have. An Archived one is offered only in the
// slots that already hold it.
export interface SlotCategoryOption extends CategoryOption {
  archived: boolean;
}

export function CreateMealTemplateForm({
  mealTypes,
  slotCategories,
}: {
  mealTypes: MealTypeOption[];
  slotCategories: SlotCategoryOption[];
}) {
  const [state, action, pending] = useActionState(createMealTemplateAction, {
    errors: [],
    slotErrors: [],
    slotCategoryIds: [],
  });
  const { invalid, allMessages } = useTemplateErrors(state);
  return (
    <form action={action} className="item-form">
      <input name="name" aria-label={t("mealTemplates.name")} placeholder={t("mealTemplates.name")} {...invalid("name")} />
      <input type="time" name="hour" aria-label={t("mealTemplates.hour")} {...invalid("hour")} />
      <MealTypeSelect mealTypes={mealTypes} defaultValue="" invalidProps={invalid("mealType")} />
      <SlotRows state={state} slotCategories={slotCategories} />
      <button type="submit" className="button-primary" disabled={pending}>
        {t("mealTemplates.add")}
      </button>
      {allMessages()}
    </form>
  );
}

function useTemplateErrors(state: MealTemplateFormState) {
  return useFieldErrors(
    state.errors,
    (error) => MEAL_TEMPLATE_ERROR_FIELDS[error],
    (error) => t(`mealTemplates.error.${error}`),
  );
}

// A Meal Template as listed, edited in place.
export function MealTemplateRow({
  id,
  name,
  hour,
  mealTypeId,
  slotCategoryIds,
  mealTypes,
  slotCategories,
}: MealTemplateContent & { id: string; mealTypes: MealTypeOption[]; slotCategories: SlotCategoryOption[] }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(
    async (previous: MealTemplateFormState, formData: FormData) => {
      const next = await editMealTemplateAction(id, previous, formData);
      if (next.errors.length === 0 && next.slotErrors.length === 0) setEditing(false);
      return next;
    },
    { errors: [], slotErrors: [], slotCategoryIds },
  );
  const { invalid, allMessages } = useTemplateErrors(state);

  if (editing) {
    return (
      <div className="list-row-open open-row">
        <form action={action} className="item-form">
          <input name="name" aria-label={t("mealTemplates.name")} defaultValue={name} autoFocus {...invalid("name")} />
          <input type="time" name="hour" aria-label={t("mealTemplates.hour")} defaultValue={hour} {...invalid("hour")} />
          <MealTypeSelect mealTypes={mealTypes} defaultValue={mealTypeId} invalidProps={invalid("mealType")} />
          <SlotRows state={state} slotCategories={slotCategories} />
          <button type="submit" className="button-primary" disabled={pending}>
            {t("mealTemplates.save")}
          </button>
          <button type="button" onClick={() => setEditing(false)}>
            {t("mealTemplates.cancel")}
          </button>
          {allMessages()}
        </form>
        <RemoveButton
          action={removeMealTemplateAction.bind(null, id)}
          label={t("mealTemplates.remove")}
          confirmMessage={t("mealTemplates.removeConfirm", { name })}
        />
      </div>
    );
  }

  const categories = slotCategoryIds.flatMap((categoryId) => slotCategories.filter(({ id }) => id === categoryId));
  return (
    <EditableRow editLabel={t("mealTemplates.edit")} onOpen={() => setEditing(true)}>
      <span className="list-row-text">
        <span className="list-row-title">{name}</span>
        <span className="list-row-meta">{mealTypes.find((mealType) => mealType.id === mealTypeId)?.label}</span>
        {categories.length > 0 && (
          <span className="pills">
            {categories.map((category, index) => (
              <FoodCategoryPill key={index} label={category.label} archived={category.archived} />
            ))}
          </span>
        )}
        {categories.some((category) => category.archived) && (
          <span className="banner banner-neutral">{t("mealTemplates.slotArchived")}</span>
        )}
      </span>
      <span className="list-row-meta">{hour}</span>
    </EditableRow>
  );
}

function MealTypeSelect({
  mealTypes,
  defaultValue,
  invalidProps,
}: {
  mealTypes: MealTypeOption[];
  defaultValue: string;
  invalidProps: InvalidProps;
}) {
  return (
    <select name="mealTypeId" aria-label={t("mealTemplates.mealType")} defaultValue={defaultValue} {...invalidProps}>
      <option value="">{t("mealTemplates.pickMealType")}</option>
      {mealTypes
        .filter((mealType) => !mealType.archived || mealType.id === defaultValue)
        .map((mealType) => (
          <option key={mealType.id} value={mealType.id}>
            {mealType.label}
          </option>
        ))}
    </select>
  );
}

// `submittedRow` is the slot's number in the last submit, which its errors use,
// so they stay with it when slots move. Null for a slot added since.
type Slot = { categoryId: string; key: string; submittedRow: number | null };

// Every slot gets a fresh key from this counter, including those refilled
// from a submit.
let nextSlotKey = 0;

function toSlots(slotCategoryIds: string[]): Slot[] {
  return slotCategoryIds.map((categoryId, index) => ({
    categoryId,
    key: String(nextSlotKey++),
    submittedRow: index + 1,
  }));
}

// The template's slots, in order, refilled from `state` after each submit.
// The pickers are uncontrolled: React resets the form after a submit, which
// would blank a controlled select, but puts an uncontrolled one back to the
// value it mounted with. Refilled slots get new keys, so they mount with what
// was sent.
function SlotRows({ state, slotCategories }: { state: MealTemplateFormState; slotCategories: SlotCategoryOption[] }) {
  const [slots, setSlots] = useState(() => toSlots(state.slotCategoryIds));
  const [shownState, setShownState] = useState(state);
  if (shownState !== state) {
    setShownState(state);
    setSlots(toSlots(state.slotCategoryIds));
  }

  const pick = (key: string, categoryId: string) =>
    setSlots((current) => current.map((slot) => (slot.key === key ? { ...slot, categoryId } : slot)));
  const add = () =>
    setSlots((current) => [...current, ...toSlots([""]).map((slot) => ({ ...slot, submittedRow: null }))]);
  const remove = (key: string) => setSlots((current) => current.filter((slot) => slot.key !== key));
  const move = (index: number, offset: -1 | 1) => setSlots((current) => moveSlot(current, index, offset));
  const { invalid, messages } = useFieldErrors(state.slotErrors, templateSlotErrorField, (error) =>
    t(`mealTemplates.error.${error.code}`, { row: error.row }),
  );

  return (
    <fieldset className="slot-rows">
      <legend>{t("mealTemplates.slots")}</legend>
      {slots.map((slot, index) => {
        const picked = slotCategories.find((category) => category.id === slot.categoryId);
        const offered = slotCategories.filter((category) => !category.archived || category.id === slot.categoryId);
        return (
          <div key={slot.key} className="slot-row">
            <span>{t("mealTemplates.slotNumber", { row: index + 1 })}</span>
            <select
              name="slotCategoryId"
              aria-label={t("mealTemplates.slotCategory")}
              defaultValue={slot.categoryId}
              onChange={(event) => pick(slot.key, event.target.value)}
              {...invalid(String(slot.submittedRow))}
            >
              <option value="">{t("mealTemplates.pickSlotCategory")}</option>
              {groupCategoriesByKind(offered).map(
                (group) =>
                  group.categories.length > 0 && (
                    <optgroup key={group.kind} label={group.heading}>
                      {group.categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.label}
                        </option>
                      ))}
                    </optgroup>
                  ),
              )}
            </select>
            <button type="button" onClick={() => move(index, -1)} disabled={index === 0}>
              {t("mealTemplates.slotUp")}
            </button>
            <button type="button" onClick={() => move(index, 1)} disabled={index === slots.length - 1}>
              {t("mealTemplates.slotDown")}
            </button>
            <button type="button" className="button-danger" onClick={() => remove(slot.key)}>
              {t("mealTemplates.slotRemove")}
            </button>
            {picked?.archived && <p className="banner banner-neutral">{t("mealTemplates.slotArchived")}</p>}
            {messages(String(slot.submittedRow))}
          </div>
        );
      })}
      <button type="button" className="button-list-add" onClick={add}>
        {t("mealTemplates.slotAdd")}
      </button>
    </fieldset>
  );
}
