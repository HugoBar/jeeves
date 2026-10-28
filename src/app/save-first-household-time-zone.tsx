"use client";

import { useEffect } from "react";
import { saveFirstHouseholdTimeZoneAction } from "./settings/actions";

// Offers this browser's time zone as the Household Time Zone. Only the first
// browser's is saved (spec "Platform"); the server's own zone is never used.
export function SaveFirstHouseholdTimeZone() {
  useEffect(() => {
    saveFirstHouseholdTimeZoneAction(Intl.DateTimeFormat().resolvedOptions().timeZone).catch(() => {});
  }, []);
  return null;
}
