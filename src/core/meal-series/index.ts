import { addDays, plannerWeeks } from "@/core/planner";

// A Meal Series: Meals repeating on chosen weekdays (spec "Meal Series",
// data-model Q5). Each repeat is an ordinary Meal (ADR 0004).

// A weekday as a Meal Series stores it: 1 is Monday, 7 is Sunday.
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7];

// What deleting or changing a Meal of a Meal Series applies to: only that
// Meal, or it and every later Planned Meal of the series. Deleting them ends
// the series; changing them changes the series too.
export type SeriesScope = "this" | "following";

export type RepeatOnError = "pastMealRepeat" | "invalidWeekday";

export type RepeatOnResult = { ok: true; weekdays: Weekday[] } | { ok: false; error: RepeatOnError };

// "Repeat on" as a Meal form sends it: each ticked weekday's number. None is
// no repeat, one is weekly, all seven is daily. Only a Meal dated `today`, the
// viewer's date, or later can repeat.
export function parseRepeatOn(ticks: readonly string[], date: string, today: string): RepeatOnResult {
  const weekdays = new Set<Weekday>();
  for (const tick of ticks) {
    const weekday = WEEKDAYS.find((day) => String(day) === tick.trim());
    if (weekday === undefined) return { ok: false, error: "invalidWeekday" };
    weekdays.add(weekday);
  }
  if (weekdays.size > 0 && date < today) return { ok: false, error: "pastMealRepeat" };
  return { ok: true, weekdays: [...weekdays].sort((a, b) => a - b) };
}

// The weekday of a "YYYY-MM-DD" day, read at UTC midnight like every planner
// day.
export function weekdayOf(date: string): Weekday {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return (day === 0 ? 7 : day) as Weekday;
}

// What creating repeats needs of a series: its days, and the last day it has
// created repeats through, first its starting Meal's day.
export interface SeriesWindow {
  weekdays: readonly Weekday[];
  generatedThrough: string;
}

// The last day repeats are created through on `today`, the viewer's date:
// the end of the planner's next week.
export function repeatsThrough(today: string): string {
  return plannerWeeks(today).nextWeek[6]!;
}

// The repeats due on `today`, the viewer's date: each ticked day after
// `generatedThrough`, never before today, up to the end of the planner's next
// week. `through` is what `generatedThrough` moves on to; it never moves back,
// which keeps a repeat deleted on its own from coming back (ADR 0004). Days
// missed while the app wasn't opened are never filled in.
export function dueRepeatDates({ weekdays, generatedThrough }: SeriesWindow, today: string): { dates: string[]; through: string } {
  const last = repeatsThrough(today);
  const dayAfter = addDays(generatedThrough, 1);
  const dates: string[] = [];
  for (let date = dayAfter > today ? dayAfter : today; date <= last; date = addDays(date, 1)) {
    if (weekdays.includes(weekdayOf(date))) dates.push(date);
  }
  return { dates, through: last > generatedThrough ? last : generatedThrough };
}

// What saving "Repeat on" with `weekdays` on a Meal of the series dated
// `date` does, applied from that Meal onwards without asking (spec "Meal
// Series"). "end": every day unticked, so the series ends there. "change":
// repeats on the `removed` days after it go, and new ones come on
// `addedDates`, the newly ticked days after it, never before `today`, the
// viewer's date, through the last day the series has created repeats on;
// later ones follow as repeats fall due. Every other repeat stays as it is.
export type RepeatOnChange =
  | { kind: "unchanged" }
  | { kind: "end" }
  | { kind: "change"; removed: Weekday[]; addedDates: string[] };

// See RepeatOnChange. `series` is the series before the change.
export function repeatOnChange(
  { weekdays: was, generatedThrough }: SeriesWindow,
  weekdays: readonly Weekday[],
  date: string,
  today: string,
): RepeatOnChange {
  if (weekdays.length === 0) return { kind: "end" };
  const added = weekdays.filter((day) => !was.includes(day));
  const removed = was.filter((day) => !weekdays.includes(day));
  if (added.length === 0 && removed.length === 0) return { kind: "unchanged" };
  const dayAfter = addDays(date, 1);
  const addedDates: string[] = [];
  for (let day = dayAfter > today ? dayAfter : today; day <= generatedThrough; day = addDays(day, 1)) {
    if (added.includes(weekdayOf(day))) addedDates.push(day);
  }
  return { kind: "change", removed: [...removed], addedDates };
}
