"use client";

import { useSyncExternalStore } from "react";
import { localDate, localHour } from "@/core/planner";

// The viewer's date and "HH:MM" time. "Today" and "now" are the viewer's,
// which the server cannot know (spec "Platform").
export interface ViewerNow {
  date: string;
  hour: string;
}

const MINUTE_MS = 60 * 1000;

// Read again every minute and whenever the app comes back into view, so an
// app left open still sees 03:00 and midnight go by.
function subscribe(onChange: () => void): () => void {
  const timer = setInterval(onChange, MINUTE_MS);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onChange);
  };
}

// The same object while the minute stays the same, as React asks of a
// snapshot.
let last: ViewerNow | null = null;

function readNow(): ViewerNow {
  const moment = new Date();
  const date = localDate(moment);
  const hour = localHour(moment);
  if (last?.date !== date || last.hour !== hour) last = { date, hour };
  return last;
}

// Null on the server and before hydration: what depends on it renders
// nothing until the browser fills it in.
export function useViewerNow(): ViewerNow | null {
  return useSyncExternalStore(subscribe, readNow, () => null);
}

// The viewer's date as they submit, which Confirmation checks the Meal's day
// against: a page left open past midnight may still show yesterday as today.
export const viewerToday = () => localDate(new Date());
