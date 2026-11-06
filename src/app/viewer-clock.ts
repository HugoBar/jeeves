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

// In development only, a page opened with `?now=2026-11-07T10:00` makes the
// app see that moment, in the viewer's time zone, and the clock runs on from
// there for the rest of the tab. `?now=` goes back to the real clock. The
// server still loads Meals around the real date, so keep it within a day or
// two of today.
const FAKE_NOW_KEY = "jeeves.fakeNowOffset";

function fakeNowOffset(): number {
  if (process.env.NODE_ENV !== "development" || typeof window === "undefined") return 0;
  try {
    const asked = new URLSearchParams(window.location.search).get("now");
    if (asked !== null) {
      const moment = asked === "" ? NaN : new Date(asked).getTime();
      if (Number.isNaN(moment)) sessionStorage.removeItem(FAKE_NOW_KEY);
      else sessionStorage.setItem(FAKE_NOW_KEY, String(moment - Date.now()));
    }
    return Number(sessionStorage.getItem(FAKE_NOW_KEY) ?? 0);
  } catch {
    return 0;
  }
}

const offset = fakeNowOffset();
if (offset !== 0) console.info(`[viewer-clock] Fake now: ${new Date(Date.now() + offset).toString()}`);

// The moment as the app sees it: the real one, or the fake one above.
export const viewerMoment = () => new Date(Date.now() + offset);

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
  const moment = viewerMoment();
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
export const viewerToday = () => localDate(viewerMoment());
