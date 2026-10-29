// Dates here are plain "YYYY-MM-DD" days with no time zone, as Meals store
// them (data-model Q9). Arithmetic runs on UTC midnights, which have no
// daylight saving gaps.
const DAY_MS = 24 * 60 * 60 * 1000;

function toTime(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function fromTime(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

// A real calendar day written "YYYY-MM-DD", as a date input sends it.
export function isDate(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(toTime(text)) && fromTime(toTime(text)) === text;
}

export function addDays(date: string, days: number): string {
  return fromTime(toTime(date) + days * DAY_MS);
}

// The Monday of the week holding `date` (weeks run Monday to Sunday).
function mondayOf(date: string): string {
  const weekday = new Date(toTime(date)).getUTCDay(); // 0 = Sunday
  return addDays(date, -((weekday + 6) % 7));
}

function weekFrom(monday: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

// The planner's two weeks, both always editable (spec "Planning").
export function plannerWeeks(today: string): { thisWeek: string[]; nextWeek: string[] } {
  const monday = mondayOf(today);
  return { thisWeek: weekFrom(monday), nextWeek: weekFrom(addDays(monday, 7)) };
}

// "Today" is the viewer's date, which the server cannot know (spec
// "Platform"). Every time zone's date is within a day of the UTC one, so this
// range holds the planner's two weeks for any viewer.
export function plannerRange(utcToday: string): { from: string; to: string } {
  return {
    from: plannerWeeks(addDays(utcToday, -1)).thisWeek[0]!,
    to: plannerWeeks(addDays(utcToday, 1)).nextWeek[6]!,
  };
}

// The time of day of `moment`, "HH:MM", in the time zone of whoever runs it.
export function localHour(moment: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(moment.getHours())}:${pad(moment.getMinutes())}`;
}

// The date of `moment` in the time zone of whoever runs it.
export function localDate(moment: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${moment.getFullYear()}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())}`;
}
