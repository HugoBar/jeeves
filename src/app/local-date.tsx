"use client";

import { useSyncExternalStore } from "react";
import { formatDayMonth } from "@/strings";

const subscribe = () => () => {};

// Shown in the viewer's time zone, which also decides "today" (spec
// "Platform"). The server cannot know that zone, so it renders nothing and
// the browser fills the text in after hydration.
export function LocalDate({ value }: { value: Date }) {
  const text = useSyncExternalStore(subscribe, () => formatDayMonth(value), () => null);
  return <time dateTime={value.toISOString()}>{text}</time>;
}
