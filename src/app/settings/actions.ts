"use server";

import { refresh } from "next/cache";
import { parseTimeZone, type TimeZoneError } from "@/core/household-time-zone";
import { getDb } from "@/db";
import { changeHouseholdTimeZone, saveFirstHouseholdTimeZone } from "@/db/settings";

// `zone` is what the form shows next: the saved zone, or what was sent when
// it was refused.
export type HouseholdTimeZoneFormState = { error: TimeZoneError | null; zone: string };

export async function changeHouseholdTimeZoneAction(
  _state: HouseholdTimeZoneFormState,
  formData: FormData,
): Promise<HouseholdTimeZoneFormState> {
  const input = String(formData.get("householdTimeZone") ?? "");
  const parsed = parseTimeZone(input);
  if (!parsed.ok) return { error: parsed.error, zone: input };
  await changeHouseholdTimeZone(getDb(), parsed.zone);
  refresh();
  return { error: null, zone: parsed.zone };
}

// Sent by every browser that opens the app; only the first one's zone is kept.
export async function saveFirstHouseholdTimeZoneAction(zone: string): Promise<void> {
  const parsed = parseTimeZone(zone);
  if (!parsed.ok) return;
  if (await saveFirstHouseholdTimeZone(getDb(), parsed.zone)) refresh();
}
