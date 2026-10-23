"use client";

import { useSyncExternalStore } from "react";
import { formatDateTime } from "@/strings";

const subscribe = () => () => {};

// Shown in the viewer's time zone until the Household Time Zone exists.
// The server cannot know that zone, so it renders nothing and the browser
// fills the text in after hydration.
export function LocalDateTime({ value }: { value: Date }) {
  const text = useSyncExternalStore(subscribe, () => formatDateTime(value), () => null);
  return <time dateTime={value.toISOString()}>{text}</time>;
}
