"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { t } from "@/strings";

// A panel for a form beside the page: on the right from 768px, with the page
// still in view and usable beside it, and filling the screen on phone. Never
// a dialog. Mount it to open it and unmount it to close it, so what was typed
// goes with it. Its close button and Escape close it. `label` is the line
// above the title, saying what the panel works on, after `icon`. A screen
// opened from the panel's own content, such as the slot picker, takes
// `back` in its place, a button back to that content, and may put `eyebrow`
// over its title.
// The line above a panel's title: what it works on, or a way back.
type SidePanelHead =
  | { icon?: ReactNode; label: string; back?: never }
  | { back: { label: string; onBack: () => void }; icon?: never; label?: never };

export function SidePanel({
  icon,
  label,
  back,
  eyebrow,
  title,
  screen = title,
  className = "",
  onClose,
  children,
}: SidePanelHead & {
  eyebrow?: string;
  title: string;
  // Which screen it shows, when screens share a title, as Add a slot's do.
  screen?: string;
  className?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // Read while rendering, as a field that focuses itself on mount takes the
  // focus before any effect runs.
  const [opener] = useState(() => (typeof document === "undefined" ? null : document.activeElement));
  // What takes the focus on opening: a field that focused itself, else the
  // title, so a screen reader starts at the panel. Kept, as a development
  // re-run of the effect finds the focus back on the opener.
  const start = useRef<Element | null>(null);
  const titleId = useId();

  useEffect(() => {
    start.current ??= panel.current?.contains(document.activeElement) ? document.activeElement : heading.current;
    if (!panel.current?.contains(document.activeElement) && start.current instanceof HTMLElement) start.current.focus();
    return () => {
      // Back on what opened it, unless the viewer has moved on elsewhere.
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [opener]);

  // A new screen in the panel, as when Add a Meal moves on to New Meal: the
  // focus goes to its title, since what was tapped is gone.
  const shownScreen = useRef(screen);
  useEffect(() => {
    if (shownScreen.current === screen) return;
    shownScreen.current = screen;
    heading.current?.focus();
  }, [screen]);

  // Escape closes it wherever the focus is, as the page beside it stays
  // usable. On the window, so a menu or sheet that takes Escape first and
  // marks it handled keeps the panel open.
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (event.target instanceof Element && event.target.closest("dialog")) return;
      onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <aside ref={panel} className={`side-panel ${className}`} aria-labelledby={titleId}>
      <div className="side-panel-head">
        {back ? (
          <button type="button" className="side-panel-back" onClick={back.onBack}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 6l-6 6 6 6" />
            </svg>
            {back.label}
          </button>
        ) : (
          <p className="side-panel-label">
            {icon}
            {label}
          </p>
        )}
        <button type="button" className="side-panel-close" aria-label={t("sheet.close")} onClick={onClose}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      {eyebrow && <p className="side-panel-eyebrow">{eyebrow}</p>}
      <h2 ref={heading} id={titleId} tabIndex={-1}>
        {title}
      </h2>
      {children}
    </aside>
  );
}
