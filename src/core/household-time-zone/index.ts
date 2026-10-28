// A calendar date with no time zone, as Meals store it: "2026-10-28".
export type IsoDate = string;

// The date it is at `instant` in the Household Time Zone `zone`. The server's
// own zone never counts (spec "Platform").
export function today(instant: Date, zone: string): IsoDate {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

// The week (Monday to Sunday) holding today in the Household Time Zone.
export function currentWeek(instant: Date, zone: string): { monday: IsoDate; sunday: IsoDate } {
  const date = today(instant, zone);
  // getUTCDay counts from Sunday = 0; Monday starts the week here.
  const daysSinceMonday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  const monday = addDays(date, -daysSinceMonday);
  return { monday, sunday: addDays(monday, 6) };
}

// Plain calendar arithmetic, done in UTC so no time zone can shift the date.
function addDays(date: IsoDate, days: number): IsoDate {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export type TimeZoneError = "unknownZone";

export type TimeZoneResult = { ok: true; zone: string } | { ok: false; error: TimeZoneError };

// An IANA zone name such as "Europe/Paris", stored under the name Intl gives
// it, whatever case it was typed in. Intl also takes UTC offsets like
// "+01:00", which are not zones: they ignore daylight saving.
export function parseTimeZone(input: string): TimeZoneResult {
  const name = input.trim();
  if (!/^[A-Za-z]/.test(name)) return { ok: false, error: "unknownZone" };
  try {
    return { ok: true, zone: new Intl.DateTimeFormat("en", { timeZone: name }).resolvedOptions().timeZone };
  } catch {
    return { ok: false, error: "unknownZone" };
  }
}
