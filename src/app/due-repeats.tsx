"use client";

import { useEffect } from "react";
import { createDueRepeatsAction } from "./planner/actions";
import { useViewerNow } from "./viewer-clock";

// On a screen that shows or uses Meals, creates the Meal Series repeats due
// on the viewer's date, which only the browser knows (spec "Meal Series",
// "Platform"). The screen is refreshed when any were created. Asked again
// when the date changes, as a new week comes into view at midnight on Sunday.
export function DueRepeats() {
  const date = useViewerNow()?.date;
  useEffect(() => {
    if (date) void createDueRepeatsAction(date);
  }, [date]);
  return null;
}
