import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import Link from "next/link";
import { connection } from "next/server";
import { unconfirmedBefore } from "@/core/planner";
import { getDb } from "@/db";
import { listPlannedMealsBefore } from "@/db/meals";
import { t } from "@/strings";
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
          <Link href="/" className="app-title">
            {t("app.name")}
          </Link>
          <nav className="app-nav">
            <Link href="/planner">{t("nav.planner")}</Link>
            <Link href="/products">{t("nav.stock")}</Link>
            <Link href="/recipes">{t("nav.recipes")}</Link>
            <Link href="/categories">{t("nav.categories")}</Link>
            <Link href="/meal-types">{t("nav.mealTypes")}</Link>
            <Link href="/meal-templates">{t("nav.mealTemplates")}</Link>
            <NeedsConfirmationBadge meals={candidates} />
          </nav>
        </header>
        <main className="app-main">
          <ResolutionGate meals={candidates}>{children}</ResolutionGate>
        </main>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
