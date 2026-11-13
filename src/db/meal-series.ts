import "server-only";
import { and, asc, eq, gt, inArray, isNull, lt, max, notExists, notInArray, or, sql } from "drizzle-orm";
import type { MealChanges } from "@/core/meals";
import { dueRepeatDates, repeatOnChange, repeatsThrough, weekdayOf, type Weekday } from "@/core/meal-series";
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
// written, so two pages opened at once never create one twice. An ended
// series creates none. How many repeats were created.
export async function createDueRepeats(db: Db, today: string): Promise<number> {
  const due = await db
    .select({ id: mealSeries.id })
    .from(mealSeries)
    .innerJoin(mealTypes, eq(mealSeries.mealTypeId, mealTypes.id))
    .where(
      and(
        isNull(mealTypes.archivedAt),
        isNull(mealSeries.endedAt),
        lt(mealSeries.generatedThrough, repeatsThrough(today)),
      ),
    );
  let created = 0;
  for (const { id } of due) created += await createSeriesRepeats(db, id, today);
  return created;
}

async function createSeriesRepeats(db: Db, seriesId: string, today: string): Promise<number> {
  return db.transaction(async (tx) => {
    const [series] = await tx.select().from(mealSeries).where(eq(mealSeries.id, seriesId)).for("update");
    if (!series || series.endedAt) return 0;
    const { dates, through } = dueRepeatDates(series, today);
    if (through === series.generatedThrough) return 0;
    await insertRepeats(tx, series, dates);
    await tx.update(mealSeries).set({ generatedThrough: through }).where(eq(mealSeries.id, seriesId));
    return dates.length;
  });
}

// Writes the series' repeats on `dates` as ordinary Planned Meals copying
// its name, Meal Type, hour, Untracked and slots' Slot Categories, in order,
// every slot empty and linked to the series slot it was copied from.
async function insertRepeats(db: Db, series: typeof mealSeries.$inferSelect, dates: readonly string[]): Promise<void> {
  if (dates.length === 0) return;
  const slots = await db
    .select({ id: layoutSlots.id, slotCategoryId: layoutSlots.slotCategoryId })
    .from(layoutSlots)
    .where(eq(layoutSlots.seriesId, series.id))
    .orderBy(asc(layoutSlots.position));
  for (const date of dates) {
    const [meal] = await db
      .insert(meals)
      .values({
        date,
        hour: series.hour,
        name: series.name,
        mealTypeId: series.mealTypeId,
        untracked: series.untracked,
        seriesId: series.id,
      })
      .returning({ id: meals.id });
    if (slots.length > 0) {
      await db.insert(mealSlots).values(
        slots.map((slot, position) => ({
          mealId: meal!.id,
          slotCategoryId: slot.slotCategoryId,
          position,
          layoutSlotId: slot.id,
        })),
      );
    }
  }
}

// Changes a Meal Series' days from one of its Meals, dated `date`, as
// "Repeat on" was saved on `today`, the viewer's date (core's
// repeatOnChange): later Planned repeats on newly unticked days are deleted,
// and repeats are added on newly ticked days, unless its Meal Type is
// Archived, as no new repeats come then. Every other repeat stays as it is,
// even one changed on its own. Unticking every day deletes every later Planned repeat and ends
// the series; the Meal itself leaves it, so it no longer repeats, and the
// series goes once no Meal belongs to it. An ended series changes nothing.
// Earlier, Confirmed and Skipped Meals never change. Run inside a
// transaction holding the series (lockMealSeries).
export async function changeRepeatOn(
  db: Db,
  { id: mealId, seriesId, date }: { id: string; seriesId: string; date: string },
  weekdays: readonly Weekday[],
  today: string,
): Promise<void> {
  const [series] = await db.select().from(mealSeries).where(eq(mealSeries.id, seriesId));
  if (!series || series.endedAt) return;
  const change = repeatOnChange(series, weekdays, date, today);
  if (change.kind === "unchanged") return;
  const later = and(eq(meals.seriesId, seriesId), eq(meals.status, "planned"), gt(meals.date, date));
  if (change.kind === "end") {
    await db.delete(meals).where(later);
    await db.update(mealSeries).set({ endedAt: new Date() }).where(eq(mealSeries.id, seriesId));
    await db.update(mealSlots).set({ layoutSlotId: null }).where(eq(mealSlots.mealId, mealId));
    await db.update(meals).set({ seriesId: null }).where(eq(meals.id, mealId));
    await removeEmptyMealSeries(db, seriesId);
    return;
  }
  if (change.removed.length > 0) {
    const repeats = await db.select({ id: meals.id, date: meals.date }).from(meals).where(later);
    const gone = repeats.filter((repeat) => change.removed.includes(weekdayOf(repeat.date))).map((repeat) => repeat.id);
    if (gone.length > 0) await db.delete(meals).where(inArray(meals.id, gone));
  }
  await db.update(mealSeries).set({ weekdays: [...weekdays] }).where(eq(mealSeries.id, seriesId));
  const [mealType] = await db
    .select({ archivedAt: mealTypes.archivedAt })
    .from(mealTypes)
    .where(eq(mealTypes.id, series.mealTypeId));
  if (mealType && !mealType.archivedAt) await insertRepeats(db, series, change.addedDates);
}

// Ends a Meal Series from one of its Meals: it and every later Planned Meal
// of the series are deleted, and the series creates no new repeats. Earlier,
// Confirmed and Skipped Meals keep it, and its "Repeats" label. Run inside a
// transaction holding the series (lockMealSeries).
export async function endMealSeries(
  db: Db,
  { id: mealId, seriesId, date }: { id: string; seriesId: string; date: string },
): Promise<void> {
  await db
    .delete(meals)
    .where(
      and(
        eq(meals.seriesId, seriesId),
        eq(meals.status, "planned"),
        or(eq(meals.id, mealId), gt(meals.date, date)),
      ),
    );
  await db.update(mealSeries).set({ endedAt: new Date() }).where(eq(mealSeries.id, seriesId));
}

// Changes a Meal Series from one of its Meals, as saved with `changes`: the
// series takes its hour, name, Untracked and slots, so its new repeats copy
// them, and it and every later Planned Meal of the series are rewritten to
// match, even ones changed on their own (ADR 0004). Earlier, Confirmed and
// Skipped Meals never change. Run inside a transaction holding the series
// (lockMealSeries), after the Meal's own slots are written.
export async function rewriteMealSeries(
  db: Db,
  meal: { id: string; seriesId: string; date: string },
  changes: MealChanges,
): Promise<void> {
  await db.update(mealSeries).set(changes).where(eq(mealSeries.id, meal.seriesId));
  await db
    .update(meals)
    .set(changes)
    .where(
      and(
        eq(meals.seriesId, meal.seriesId),
        eq(meals.status, "planned"),
        or(eq(meals.id, meal.id), gt(meals.date, meal.date)),
      ),
    );
  const layout = await copySlotsToSeries(db, meal);
  const later = await db
    .select({ id: meals.id })
    .from(meals)
    .where(and(eq(meals.seriesId, meal.seriesId), eq(meals.status, "planned"), gt(meals.date, meal.date)));
  for (const repeat of later) await matchSlotsToSeries(db, repeat.id, layout);
}

// The series' slots made the Meal's, in its order (data-model Q5): a series
// slot the Meal's slot was copied from takes its Slot Category and place, one
// the Meal no longer has goes (earlier Meals' slots copied from it keep their
// food and lose only the link), and a slot added to the Meal only becomes a
// new series slot, linked to it. The unique (series, position) index is
// checked row by row, so every series slot steps aside to a negative
// position first. The series' slots, in order.
async function copySlotsToSeries(
  db: Db,
  { id: mealId, seriesId }: { id: string; seriesId: string },
): Promise<{ id: string; slotCategoryId: string }[]> {
  const slots = await db
    .select({ id: mealSlots.id, slotCategoryId: mealSlots.slotCategoryId, layoutSlotId: mealSlots.layoutSlotId })
    .from(mealSlots)
    .where(eq(mealSlots.mealId, mealId))
    .orderBy(asc(mealSlots.position));
  const stillLinked = slots.flatMap((slot) => (slot.layoutSlotId === null ? [] : [slot.layoutSlotId]));
  const ofSeries = eq(layoutSlots.seriesId, seriesId);
  await db.delete(layoutSlots).where(stillLinked.length > 0 ? and(ofSeries, notInArray(layoutSlots.id, stillLinked)) : ofSeries);
  await db.update(layoutSlots).set({ position: sql`-1 - ${layoutSlots.position}` }).where(ofSeries);
  const layout: { id: string; slotCategoryId: string }[] = [];
  for (const [position, slot] of slots.entries()) {
    if (slot.layoutSlotId !== null) {
      await db
        .update(layoutSlots)
        .set({ slotCategoryId: slot.slotCategoryId, position })
        .where(eq(layoutSlots.id, slot.layoutSlotId));
      layout.push({ id: slot.layoutSlotId, slotCategoryId: slot.slotCategoryId });
    } else {
      const [added] = await db
        .insert(layoutSlots)
        .values({ seriesId, slotCategoryId: slot.slotCategoryId, position })
        .returning({ id: layoutSlots.id });
      await db.update(mealSlots).set({ layoutSlotId: added!.id }).where(eq(mealSlots.id, slot.id));
      layout.push({ id: added!.id, slotCategoryId: slot.slotCategoryId });
    }
  }
  return layout;
}

// A repeat's slots made the series' `layout`, in its order: a slot keeps its
// food while the series slot it was copied from is still there, whatever its
// place, and takes that series slot's Slot Category; a series slot it has
// none of comes empty; any other slot, added to it only or copied from a
// series slot now gone, goes with its food. Every slot steps aside to a
// negative position first, as the unique (meal, position) index is checked
// row by row.
async function matchSlotsToSeries(
  db: Db,
  mealId: string,
  layout: readonly { id: string; slotCategoryId: string }[],
): Promise<void> {
  const ofMeal = eq(mealSlots.mealId, mealId);
  const linked = layout.map((slot) => slot.id);
  await db
    .delete(mealSlots)
    .where(
      and(
        ofMeal,
        linked.length > 0
          ? or(isNull(mealSlots.layoutSlotId), notInArray(mealSlots.layoutSlotId, linked))
          : undefined,
      ),
    );
  await db.update(mealSlots).set({ position: sql`-1 - ${mealSlots.position}` }).where(ofMeal);
  const kept = await db
    .select({ id: mealSlots.id, layoutSlotId: mealSlots.layoutSlotId })
    .from(mealSlots)
    .where(ofMeal);
  for (const [position, { id: layoutSlotId, slotCategoryId }] of layout.entries()) {
    const slot = kept.find((one) => one.layoutSlotId === layoutSlotId);
    if (slot) {
      await db.update(mealSlots).set({ slotCategoryId, position }).where(eq(mealSlots.id, slot.id));
    } else {
      await db.insert(mealSlots).values({ mealId, slotCategoryId, position, layoutSlotId });
    }
  }
}

// A slot just added to one of a Meal Series' Meals made one of the series':
// a new series slot after its others, which the slot is linked to, and an
// empty slot of its Slot Category, linked to it too, after the others of
// every later Planned Meal of the series. Every other slot stays as it is.
// Earlier, Confirmed and Skipped Meals never change. Run inside a transaction
// holding the series (lockMealSeries).
export async function addSeriesSlot(
  db: Db,
  meal: { id: string; seriesId: string; date: string },
  slot: { id: string; slotCategoryId: string },
): Promise<void> {
  const [last] = await db
    .select({ position: max(layoutSlots.position) })
    .from(layoutSlots)
    .where(eq(layoutSlots.seriesId, meal.seriesId));
  const [layoutSlot] = await db
    .insert(layoutSlots)
    .values({ seriesId: meal.seriesId, slotCategoryId: slot.slotCategoryId, position: nextPosition(last) })
    .returning({ id: layoutSlots.id });
  await db.update(mealSlots).set({ layoutSlotId: layoutSlot!.id }).where(eq(mealSlots.id, slot.id));
  // Held, so a slot added or removed on one of them meanwhile waits.
  const later = await db
    .select({ id: meals.id })
    .from(meals)
    .where(and(eq(meals.seriesId, meal.seriesId), eq(meals.status, "planned"), gt(meals.date, meal.date)))
    .for("update");
  for (const repeat of later) {
    const [lastOfMeal] = await db
      .select({ position: max(mealSlots.position) })
      .from(mealSlots)
      .where(eq(mealSlots.mealId, repeat.id));
    await db.insert(mealSlots).values({
      mealId: repeat.id,
      slotCategoryId: slot.slotCategoryId,
      position: nextPosition(lastOfMeal),
      layoutSlotId: layoutSlot!.id,
    });
  }
}

// The position after the highest one, or the first when there is none.
export function nextPosition(last: { position: number | null } | undefined): number {
  return last?.position == null ? 0 : last.position + 1;
}

// Held while its Meals are deleted or rewritten, so repeats can't be
// created meanwhile.
export async function lockMealSeries(db: Db, seriesId: string): Promise<void> {
  await db.select({ id: mealSeries.id }).from(mealSeries).where(eq(mealSeries.id, seriesId)).for("update");
}

// Deletes the Meal Series once no Meal belongs to it, ended or not, so it
// creates no more repeats.
export async function removeEmptyMealSeries(db: Db, seriesId: string): Promise<void> {
  await db
    .delete(mealSeries)
    .where(
      and(
        eq(mealSeries.id, seriesId),
        notExists(db.select({ id: meals.id }).from(meals).where(eq(meals.seriesId, seriesId))),
      ),
    );
}
