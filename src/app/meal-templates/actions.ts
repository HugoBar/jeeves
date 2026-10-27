"use server";

import { refresh } from "next/cache";
import {
  parseMealTemplateFields,
  parseTemplateSlots,
  type MealTemplateFieldError,
  type TemplateSlotError,
} from "@/core/meal-templates";
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

export async function editMealTemplateAction(
  id: string,
  _state: MealTemplateFormState,
  formData: FormData,
): Promise<MealTemplateFormState> {
  const db = getDb();
  if (!(await getMealTemplate(db, id))) throw new Error("Meal Template not found");
  const parsed = await parseMealTemplateForm(formData, [id]);
  if (!parsed.ok) return parsed.state;
  await updateMealTemplate(db, id, parsed.content);
  refresh();
  return { errors: [], slotErrors: [], slotCategoryIds: parsed.content.slotCategoryIds };
}

export async function removeMealTemplateAction(id: string): Promise<void> {
  await deleteMealTemplate(getDb(), id);
  refresh();
}

// Checks the fields and the slots together, so every error shows at once.
// `templateIds` is the template being edited, if any, whose Archived Meal Type
// and Slot Categories it may keep.
async function parseMealTemplateForm(formData: FormData, templateIds: string[]) {
  const db = getDb();
  const [mealTypes, pickable] = await Promise.all([
    listPickableMealTypes(db, templateIds),
    listPickableSlotCategories(db, templateIds),
  ]);
  const fields = parseMealTemplateFields(
    {
      name: String(formData.get("name") ?? ""),
      hour: String(formData.get("hour") ?? ""),
      mealTypeId: String(formData.get("mealTypeId") ?? ""),
    },
    new Set(mealTypes.map((mealType) => mealType.id)),
  );
  // Each slot row submits its Slot Category, in order.
  const slotCategoryIds = formData.getAll("slotCategoryId").map(String);
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
