import "server-only";
import { and, asc, eq, isNull, lt } from "drizzle-orm";
import { dueRepeatDates, repeatsThrough, type Weekday } from "@/core/meal-series";
import type { Db } from "./index";
import { layoutSlots, mealSeries, mealSlots, meals, mealTypes } from "./schema";

// Starts a Meal Series from the Meal, which belongs to it even if its own
// weekday isn't ticked (spec "Meal Series"). The series copies its name, Meal
// Type, hour, Untracked and its slots' Slot Categories, in order, and its
// slots are linked to the series slots they were copied to. Run inside the
// transaction that writes the Meal, after its slots. Nothing if the Meal is
// gone or already in a series.
export async function startMealSeries(db: Db, mealId: string, weekdays: readonly Weekday[]): Promise<void> {
  const [meal] = await db.select().from(meals).where(eq(meals.id, mealId));
  if (!meal || meal.seriesId !== null) return;
  const [series] = await db
    .insert(mealSeries)
    .values({
      name: meal.name,
      mealTypeId: meal.mealTypeId,
      hour: meal.hour,
      untracked: meal.untracked,
      weekdays: [...weekdays],
      generatedThrough: meal.date,
    })
    .returning({ id: mealSeries.id });
  const slots = await db
    .select({ id: mealSlots.id, slotCategoryId: mealSlots.slotCategoryId })
    .from(mealSlots)
    .where(eq(mealSlots.mealId, mealId))
    .orderBy(asc(mealSlots.position));
  for (const [position, slot] of slots.entries()) {
    const [layoutSlot] = await db
      .insert(layoutSlots)
      .values({ seriesId: series!.id, slotCategoryId: slot.slotCategoryId, position })
      .returning({ id: layoutSlots.id });
    await db.update(mealSlots).set({ layoutSlotId: layoutSlot!.id }).where(eq(mealSlots.id, slot.id));
  }
  await db.update(meals).set({ seriesId: series!.id }).where(eq(meals.id, mealId));
}

// Creates the repeats due on `today`, the viewer's date (core's
// dueRepeatDates), as ordinary Planned Meals with every slot empty, even on a
// day that already has a Meal of the same Meal Type. A series whose Meal Type
// is Archived creates none. Each series is held while its repeats are
// written, so two pages opened at once never create one twice. How many
// repeats were created.
export async function createDueRepeats(db: Db, today: string): Promise<number> {
  const due = await db
    .select({ id: mealSeries.id })
    .from(mealSeries)
    .innerJoin(mealTypes, eq(mealSeries.mealTypeId, mealTypes.id))
    .where(and(isNull(mealTypes.archivedAt), lt(mealSeries.generatedThrough, repeatsThrough(today))));
  let created = 0;
  for (const { id } of due) created += await createSeriesRepeats(db, id, today);
  return created;
}

async function createSeriesRepeats(db: Db, seriesId: string, today: string): Promise<number> {
  return db.transaction(async (tx) => {
    const [series] = await tx.select().from(mealSeries).where(eq(mealSeries.id, seriesId)).for("update");
    if (!series) return 0;
    const { dates, through } = dueRepeatDates(series, today);
    if (through === series.generatedThrough) return 0;
    const slots = await tx
      .select({ id: layoutSlots.id, slotCategoryId: layoutSlots.slotCategoryId })
      .from(layoutSlots)
      .where(eq(layoutSlots.seriesId, seriesId))
      .orderBy(asc(layoutSlots.position));
    for (const date of dates) {
      const [meal] = await tx
        .insert(meals)
        .values({
          date,
          hour: series.hour,
          name: series.name,
          mealTypeId: series.mealTypeId,
          untracked: series.untracked,
          seriesId,
        })
        .returning({ id: meals.id });
      if (slots.length > 0) {
        await tx.insert(mealSlots).values(
          slots.map((slot, position) => ({
            mealId: meal!.id,
            slotCategoryId: slot.slotCategoryId,
            position,
            layoutSlotId: slot.id,
          })),
        );
      }
    }
    await tx.update(mealSeries).set({ generatedThrough: through }).where(eq(mealSeries.id, seriesId));
    return dates.length;
  });
}
