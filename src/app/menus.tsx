"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { t } from "@/strings";
import { activeMenuHref, bottomMenu, topMenu } from "./menu-items";

export function TopMenu() {
  const active = activeMenuHref(topMenu, usePathname());
  return (
    <nav aria-label={t("nav.main")} className="top-menu">
      {topMenu.map(({ href, label }) => (
        <Link key={href} href={href} aria-current={href === active ? "page" : undefined}>
          {t(label)}
        </Link>
      ))}
    </nav>
  );
}

export function BottomMenu() {
  const active = activeMenuHref(bottomMenu, usePathname());
  return (
    <nav aria-label={t("nav.main")} className="bottom-menu">
      {bottomMenu.map(({ href, label, icon }) => (
        <Link key={href} href={href} aria-current={href === active ? "page" : undefined}>
          <span className="bottom-menu-icon">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={icon} />
            </svg>
          </span>
          {t(label)}
        </Link>
      ))}
    </nav>
  );
}
