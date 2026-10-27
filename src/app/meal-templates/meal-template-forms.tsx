"use client";

import { useActionState, useState } from "react";
import { moveSlot, type MealTemplateContent } from "@/core/meal-templates";
import { t } from "@/strings";
import { groupCategoriesByKind } from "../categories/category-groups";
import type { CategoryOption } from "../categories/category-options";
import { RemoveButton } from "../remove-button";
import {
  createMealTemplateAction,
  editMealTemplateAction,
  removeMealTemplateAction,
  type MealTemplateFormState,
} from "./actions";


// A Meal Type as the picker offers it, by the label the user sees.
export interface MealTypeOption {
  id: string;
  label: string;
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
  return (
    <form action={action} className="item-form">
      <input name="name" aria-label={t("mealTemplates.name")} placeholder={t("mealTemplates.name")} />
      <input type="time" name="hour" aria-label={t("mealTemplates.hour")} />
      <MealTypeSelect mealTypes={mealTypes} defaultValue="" />
      <SlotRows state={state} slotCategories={slotCategories} />
      <button type="submit" disabled={pending}>
        {t("mealTemplates.add")}
      </button>
      <FormErrors state={state} />
    </form>
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

  if (editing) {
    return (
      <form action={action} className="item-form">
        <input name="name" aria-label={t("mealTemplates.name")} defaultValue={name} autoFocus />
        <input type="time" name="hour" aria-label={t("mealTemplates.hour")} defaultValue={hour} />
        <MealTypeSelect mealTypes={mealTypes} defaultValue={mealTypeId} />
        <SlotRows state={state} slotCategories={slotCategories} />
        <button type="submit" disabled={pending}>
          {t("mealTemplates.save")}
        </button>
        <button type="button" onClick={() => setEditing(false)}>
          {t("mealTemplates.cancel")}
        </button>
        <FormErrors state={state} />
      </form>
    );
  }

  return (
    <div className="item-row">
      <span>{name}</span>
      <span>{hour}</span>
      <span>{mealTypes.find((mealType) => mealType.id === mealTypeId)?.label}</span>
      <button type="button" onClick={() => setEditing(true)}>
        {t("mealTemplates.edit")}
      </button>
      <RemoveButton
        action={removeMealTemplateAction.bind(null, id)}
        label={t("mealTemplates.remove")}
        confirmMessage={t("mealTemplates.removeConfirm", { name })}
      />
      {slotCategoryIds.length > 0 && (
        <ol className="slot-list" aria-label={t("mealTemplates.slots")}>
          {slotCategoryIds.map((categoryId, index) => {
            const category = slotCategories.find((option) => option.id === categoryId);
            return (
              <li key={index}>
                {category?.label}
                {category?.archived && <span className="form-error"> {t("mealTemplates.slotArchived")}</span>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function MealTypeSelect({ mealTypes, defaultValue }: { mealTypes: MealTypeOption[]; defaultValue: string }) {
  return (
    <select name="mealTypeId" aria-label={t("mealTemplates.mealType")} defaultValue={defaultValue}>
      <option value="">{t("mealTemplates.pickMealType")}</option>
      {mealTypes.map((mealType) => (
        <option key={mealType.id} value={mealType.id}>
          {mealType.label}
        </option>
      ))}
    </select>
  );
}

type Slot = { categoryId: string; key: string };

// Every slot gets a fresh key from this counter, including those refilled
// from a submit.
let nextSlotKey = 0;

function toSlots(slotCategoryIds: string[]): Slot[] {
  return slotCategoryIds.map((categoryId) => ({ categoryId, key: String(nextSlotKey++) }));
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
  const add = () => setSlots((current) => [...current, ...toSlots([""])]);
  const remove = (key: string) => setSlots((current) => current.filter((slot) => slot.key !== key));
  const move = (index: number, offset: -1 | 1) => setSlots((current) => moveSlot(current, index, offset));

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
            <button type="button" onClick={() => remove(slot.key)}>
              {t("mealTemplates.slotRemove")}
            </button>
            {picked?.archived && <p className="form-error">{t("mealTemplates.slotArchived")}</p>}
          </div>
        );
      })}
      <button type="button" onClick={add}>
        {t("mealTemplates.slotAdd")}
      </button>
    </fieldset>
  );
}

function FormErrors({ state }: { state: MealTemplateFormState }) {
  return (
    <>
      {state.errors.map((error) => (
        <p key={error} className="form-error">
          {t(`mealTemplates.error.${error}`)}
        </p>
      ))}
      {state.slotErrors.map((error) => (
        <p key={`${error.row}-${error.code}`} className="form-error">
          {t(`mealTemplates.error.${error.code}`, { row: error.row })}
        </p>
      ))}
    </>
  );
}
