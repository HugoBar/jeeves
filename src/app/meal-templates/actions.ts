"use server";

import { refresh } from "next/cache";
import {
  parseMealTemplateFields,
  parseTemplateSlots,
  type MealTemplateFieldError,
  type TemplateSlotError,
} from "@/core/meal-templates";
import { requireList, requireText, requireUuid, requireUuidOrBlank } from "@/core/request";
import { getDb } from "@/db";
import {
  createMealTemplate,
  deleteMealTemplate,
  getMealTemplate,
  listPickableMealTypes,
  listPickableSlotCategories,
  updateMealTemplate,
} from "@/db/meal-templates";

// `slotCategoryIds` refills the slots after each submit, which React resets:
// what was sent after a rejected one, none after a template is added.
export type MealTemplateFormState = {
  errors: MealTemplateFieldError[];
  slotErrors: TemplateSlotError[];
  slotCategoryIds: string[];
};

export async function createMealTemplateAction(
  _state: MealTemplateFormState,
  formData: FormData,
): Promise<MealTemplateFormState> {
  const parsed = await parseMealTemplateForm(formData, []);
  if (!parsed.ok) return parsed.state;
  await createMealTemplate(getDb(), parsed.content);
  refresh();
  return { errors: [], slotErrors: [], slotCategoryIds: [] };
}

// A template removed meanwhile has nothing to edit; the refresh shows it gone.
export async function editMealTemplateAction(
  id: string,
  _state: MealTemplateFormState,
  formData: FormData,
): Promise<MealTemplateFormState> {
  requireUuid(id);
  const db = getDb();
  if (!(await getMealTemplate(db, id))) {
    refresh();
    return { errors: [], slotErrors: [], slotCategoryIds: [] };
  }
  const parsed = await parseMealTemplateForm(formData, [id]);
  if (!parsed.ok) return parsed.state;
  await updateMealTemplate(db, id, parsed.content);
  refresh();
  return { errors: [], slotErrors: [], slotCategoryIds: parsed.content.slotCategoryIds };
}

export async function removeMealTemplateAction(id: string): Promise<void> {
  await deleteMealTemplate(getDb(), requireUuid(id));
  refresh();
}

// Checks the fields and the slots together, so every error shows at once.
// `templateIds` is the template being edited, if any, whose Archived Meal Type
// and Slot Categories it may keep.
async function parseMealTemplateForm(formData: FormData, templateIds: string[]) {
  const name = requireText(formData.get("name"));
  const hour = requireText(formData.get("hour"));
  const mealTypeId = requireUuidOrBlank(requireText(formData.get("mealTypeId")));
  // Each slot row submits its Slot Category, in order.
  const slotCategoryIds = requireList(formData.getAll("slotCategoryId"), requireUuidOrBlank);
  const db = getDb();
  const [mealTypes, pickable] = await Promise.all([
    listPickableMealTypes(db, templateIds),
    listPickableSlotCategories(db, templateIds),
  ]);
  const fields = parseMealTemplateFields(
    { name, hour, mealTypeId },
    new Set(mealTypes.map((mealType) => mealType.id)),
  );
  const slots = parseTemplateSlots(slotCategoryIds, new Set(pickable.map((category) => category.id)));
  if (!fields.ok || !slots.ok) {
    return {
      ok: false as const,
      state: {
        errors: fields.ok ? [] : fields.errors,
        slotErrors: slots.ok ? [] : slots.errors,
        slotCategoryIds,
      },
    };
  }
  return { ok: true as const, content: { ...fields.fields, slotCategoryIds: slots.slotCategoryIds } };
}
