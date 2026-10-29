"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { mustResolve, needingConfirmation, type MealStatus } from "@/core/meals";
import { t } from "@/strings";
import { useViewerNow } from "./viewer-clock";

// Every Meal that could be Unconfirmed for any viewer, as the alerts need it.
export type UnconfirmedCandidate = { status: MealStatus; date: string };

export const NEEDS_CONFIRMATION_PATH = "/needs-confirmation";

// The in-app badge (#1): how many Unconfirmed Meals need confirmation, counting
// yesterday's only from 03:00. It opens the "Needs confirmation" list.
export function NeedsConfirmationBadge({ meals }: { meals: UnconfirmedCandidate[] }) {
  const now = useViewerNow();
  if (!now) return null;
  const count = needingConfirmation(meals, now).length;
  if (count === 0) return null;
  return (
    <Link href={NEEDS_CONFIRMATION_PATH} className="app-badge">
      {t("nav.needsConfirmation", { count })}
    </Link>
  );
}

// Once a week has ended with Unconfirmed Meals, from 03:00 on the Monday
// after, every page sends the viewer to the resolution screen until they are
// cleared (#1). Planning the next week is still a click away once they are.
export function ResolutionGate({ meals, children }: { meals: UnconfirmedCandidate[]; children: React.ReactNode }) {
  const now = useViewerNow();
  const pathname = usePathname();
  const router = useRouter();
  const blocked = now !== null && pathname !== NEEDS_CONFIRMATION_PATH && mustResolve(meals, now).length > 0;
  useEffect(() => {
    if (blocked) router.replace(NEEDS_CONFIRMATION_PATH);
  }, [blocked, router]);
  return blocked ? null : children;
}
