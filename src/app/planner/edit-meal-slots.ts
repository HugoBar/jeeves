import { moveSlot, type SlotMove } from "@/core/slot-order";
import type { PlannerMealSlot, SlotCategoryOption } from "./meal-card";

// The slot changes made on Edit Meal and not saved yet: written together
// with hour, name and Untracked on Save, dropped when it closes without.
// `order` is the slots by id once moved, null until one is; `slotCategories`
// the new Slot Category by slot id. A food change is not kept here: it is
// written straight away.
export interface SlotEdits {
  order: string[] | null;
  removed: string[];
  slotCategories: Record<string, string>;
}

export const NO_SLOT_EDITS: SlotEdits = { order: null, removed: [], slotCategories: {} };

// Whether any slot was moved, removed or given a new Slot Category on the
// form.
export function hasSlotEdits(edits: SlotEdits): boolean {
  return edits.order !== null || edits.removed.length > 0 || Object.keys(edits.slotCategories).length > 0;
}

// The Meal's slots as Edit Meal shows them, with `edits` made on them. A slot
// added meanwhile goes after the ones put in order, and one removed meanwhile
// is simply gone. A new Slot Category is one of `slotCategories`, the
// non-Archived ones; one Archived meanwhile is dropped, as Save would refuse
// it.
export function shownSlots(
  slots: readonly PlannerMealSlot[],
  edits: SlotEdits,
  slotCategories: readonly SlotCategoryOption[],
): PlannerMealSlot[] {
  const kept = slots.filter((slot) => !edits.removed.includes(slot.id));
  const { order } = edits;
  const place = (slot: PlannerMealSlot) =>
    order && order.includes(slot.id) ? order.indexOf(slot.id) : (order?.length ?? 0);
  return [...kept]
    .sort((a, b) => place(a) - place(b))
    .map((slot) => {
      const category = slotCategories.find((option) => option.id === edits.slotCategories[slot.id]);
      if (!category || category.id === slot.slotCategoryId) return slot;
      return { ...slot, slotCategoryId: category.id, slotCategoryLabel: category.label, slotCategoryArchived: false };
    });
}

// `edits` with the shown slot at `index` moved one place.
export function moveShownSlot(edits: SlotEdits, shown: readonly PlannerMealSlot[], index: number, offset: SlotMove): SlotEdits {
  return { ...edits, order: moveSlot(shown, index, offset).map((slot) => slot.id) };
}

// `edits` with the slot removed on the form.
export function withSlotRemoved(edits: SlotEdits, slotId: string): SlotEdits {
  return { ...edits, removed: [...edits.removed, slotId] };
}

// `edits` with the slot given a new Slot Category on the form.
export function withSlotCategory(edits: SlotEdits, slotId: string, slotCategoryId: string): SlotEdits {
  return { ...edits, slotCategories: { ...edits.slotCategories, [slotId]: slotCategoryId } };
}
