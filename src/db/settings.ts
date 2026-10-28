import "server-only";
import type { Db } from "./index";
import { settings } from "./schema";

// The Household Time Zone, or null until the first browser has saved its own.
export async function getHouseholdTimeZone(db: Db): Promise<string | null> {
  const [row] = await db.select({ zone: settings.householdTimeZone }).from(settings);
  return row?.zone ?? null;
}

// Saves the first browser's zone, once: a zone already saved, by an earlier
// browser or in Settings, is kept. Tells whether this one was saved.
export async function saveFirstHouseholdTimeZone(db: Db, zone: string): Promise<boolean> {
  const saved = await db
    .insert(settings)
    .values({ householdTimeZone: zone })
    .onConflictDoNothing()
    .returning({ id: settings.id });
  return saved.length > 0;
}

// Only moves "today"; Meal dates and hours never change with it.
export async function changeHouseholdTimeZone(db: Db, zone: string): Promise<void> {
  await db
    .insert(settings)
    .values({ householdTimeZone: zone })
    .onConflictDoUpdate({ target: settings.id, set: { householdTimeZone: zone } });
}
