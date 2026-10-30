import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import Link from "next/link";
import { connection } from "next/server";
import { unconfirmedBefore } from "@/core/planner";
import { getDb } from "@/db";
import { listPlannedMealsBefore } from "@/db/meals";
import { t } from "@/strings";
import { BottomMenu, TopMenu } from "./menus";
import { ServiceWorkerRegistration } from "./service-worker-registration";
import { theme } from "./theme";
import { NeedsConfirmationBadge, ResolutionGate, type UnconfirmedCandidate } from "./unconfirmed-alerts";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: t("app.name"),
  description: t("app.description"),
  appleWebApp: { capable: true, title: t("app.name") },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: theme.accent,
  colorScheme: "light",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Read from the database on every request, never at build time.
  await connection();
  // Which Meals are Unconfirmed depends on the viewer's date, known only in
  // the browser. A layout is not rendered again on navigation, but every Meal
  // action refreshes it.
  const utcToday = new Date().toISOString().slice(0, 10);
  const candidates: UnconfirmedCandidate[] = (await listPlannedMealsBefore(getDb(), unconfirmedBefore(utcToday))).map(
    ({ status, date }) => ({ status, date }),
  );
  return (
    <html lang="en" className={plusJakartaSans.className}>
      <body>
        <header className="app-header">
          <div className="app-header-bar">
            <Link href="/" className="app-logo" aria-label={t("nav.home")}>
              <span className="app-logo-mark">
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 10h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM3 6h18v4H3z" />
                </svg>
              </span>
              {t("app.name")}
            </Link>
            <TopMenu />
            <NeedsConfirmationBadge meals={candidates} />
          </div>
        </header>
        <main className="app-main">
          <ResolutionGate meals={candidates}>{children}</ResolutionGate>
        </main>
        <BottomMenu />
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
