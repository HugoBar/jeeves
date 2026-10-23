import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { t } from "@/strings";
import { ServiceWorkerRegistration } from "./service-worker-registration";
import { theme } from "./theme";
import "./globals.css";

export const metadata: Metadata = {
  title: t("app.name"),
  description: t("app.description"),
  appleWebApp: { capable: true, title: t("app.name") },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: theme.accent,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="app-header">
          <Link href="/" className="app-title">
            {t("app.name")}
          </Link>
          <nav className="app-nav">
            <Link href="/products">{t("nav.stock")}</Link>
            <Link href="/categories">{t("nav.categories")}</Link>
          </nav>
        </header>
        <main className="app-main">{children}</main>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
