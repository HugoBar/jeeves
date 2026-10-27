import "server-only";
import { asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { MealTemplateContent } from "@/core/meal-templates";
import type { FoodCategory } from "./food-categories";
import type { Db } from "./index";
import type { MealType } from "./meal-types";
import { foodCategories, layoutSlots, mealTemplates, mealTypes } from "./schema";

export interface MealTemplate extends MealTemplateContent {
  id: string;
}

type StoredMealTemplate = typeof mealTemplates.$inferSelect;

// Postgres reads a `time` back as "HH:MM:SS"; core works in "HH:MM".
function toMealTemplate({ id, name, hour, mealTypeId }: StoredMealTemplate, slotCategoryIds: string[]): MealTemplate {
  return { id, name, hour: hour.slice(0, 5), mealTypeId, slotCategoryIds };
}

// Each template's slots' Slot Categories in order, by template id.
async function slotCategoryIdsByTemplate(db: Db, templateIds: string[]): Promise<Map<string, string[]>> {
  const byTemplate = new Map<string, string[]>(templateIds.map((id) => [id, []]));
  if (templateIds.length === 0) return byTemplate;
  const slots = await db
    .select({ templateId: layoutSlots.templateId, slotCategoryId: layoutSlots.slotCategoryId })
    .from(layoutSlots)
    .where(inArray(layoutSlots.templateId, templateIds))
    .orderBy(asc(layoutSlots.position));
  for (const slot of slots) byTemplate.get(slot.templateId)!.push(slot.slotCategoryId);
  return byTemplate;
}

export async function listMealTemplates(db: Db): Promise<MealTemplate[]> {
  const rows = await db.select().from(mealTemplates);
  const slots = await slotCategoryIdsByTemplate(db, rows.map((row) => row.id));
  return rows.map((row) => toMealTemplate(row, slots.get(row.id)!));
}

export async function getMealTemplate(db: Db, id: string): Promise<MealTemplate | undefined> {
  const [row] = await db.select().from(mealTemplates).where(eq(mealTemplates.id, id));
  if (!row) return undefined;
  const slots = await slotCategoryIdsByTemplate(db, [id]);
  return toMealTemplate(row, slots.get(id)!);
}

// The Slot Categories must already be checked by core's parseTemplateSlots.
export async function createMealTemplate(
  db: Db,
  { slotCategoryIds, ...fields }: MealTemplateContent,
): Promise<MealTemplate> {
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(mealTemplates).values(fields).returning();
    await insertSlots(tx, row!.id, slotCategoryIds);
    return toMealTemplate(row!, slotCategoryIds);
  });
}

// Saving replaces every slot, renumbering them in the order given.
export async function updateMealTemplate(
  db: Db,
  id: string,
  { slotCategoryIds, ...changes }: MealTemplateContent,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(mealTemplates).set(changes).where(eq(mealTemplates.id, id));
    await tx.delete(layoutSlots).where(eq(layoutSlots.templateId, id));
    await insertSlots(tx, id, slotCategoryIds);
  });
}

async function insertSlots(db: Db, templateId: string, slotCategoryIds: string[]): Promise<void> {
  if (slotCategoryIds.length === 0) return;
  await db
    .insert(layoutSlots)
    .values(slotCategoryIds.map((slotCategoryId, position) => ({ templateId, slotCategoryId, position })));
}

export interface PickableSlotCategory extends Pick<FoodCategory, "id" | "seedKey" | "name" | "kind"> {
  archived: boolean;
}

// The Food Categories a slot of the given templates can have: the
// non-Archived ones, plus any Archived one those templates already use, so
// saving one never drops or swaps out that slot's Slot Category.
export async function listPickableSlotCategories(db: Db, templateIds: string[]): Promise<PickableSlotCategory[]> {
  const usedByTemplates =
    templateIds.length > 0
      ? inArray(
          foodCategories.id,
          db
            .select({ id: layoutSlots.slotCategoryId })
            .from(layoutSlots)
            .where(inArray(layoutSlots.templateId, templateIds)),
        )
      : undefined;
  return db
    .select({
      id: foodCategories.id,
      seedKey: foodCategories.seedKey,
      name: foodCategories.name,
      kind: foodCategories.kind,
      archived: sql<boolean>`${foodCategories.archivedAt} is not null`,
    })
    .from(foodCategories)
    .where(or(isNull(foodCategories.archivedAt), usedByTemplates));
}

export interface PickableMealType extends Pick<MealType, "id" | "seedKey" | "name" | "priority"> {
  archived: boolean;
}

// The Meal Types the given templates can have: the non-Archived ones, plus any
// Archived one those templates already use, so saving one never drops or swaps
// out its Meal Type.
export async function listPickableMealTypes(db: Db, templateIds: string[]): Promise<PickableMealType[]> {
  const usedByTemplates =
    templateIds.length > 0
      ? inArray(
          mealTypes.id,
          db
            .select({ id: mealTemplates.mealTypeId })
            .from(mealTemplates)
            .where(inArray(mealTemplates.id, templateIds)),
        )
      : undefined;
  return db
    .select({
      id: mealTypes.id,
      seedKey: mealTypes.seedKey,
      name: mealTypes.name,
      priority: mealTypes.priority,
      archived: sql<boolean>`${mealTypes.archivedAt} is not null`,
    })
    .from(mealTypes)
    .where(or(isNull(mealTypes.archivedAt), usedByTemplates));
}

// Nothing refers to a template, so it is always hard deleted, never Archived.
// Its own slots cascade.
export async function deleteMealTemplate(db: Db, id: string): Promise<void> {
  await db.delete(mealTemplates).where(eq(mealTemplates.id, id));
}
