"use client";

import { useEffect, useId, useRef, useTransition, type ReactNode } from "react";
import { t } from "@/strings";

// A bottom sheet on phone and a centered dialog on desktop. Mount it to open
// it and unmount it to close it. A native modal dialog, so Escape closes it
// and the page behind can't be reached meanwhile. While `busy` it can't be
// closed, as what is running would carry on and closing would look like
// cancelling it.
export function Sheet({
  eyebrow,
  title,
  busy = false,
  onClose,
  children,
}: {
  eyebrow?: string;
  title: string;
  busy?: boolean;
  onClose: () => void;
  children?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (dialog.current && !dialog.current.open) {
      opener.current = document.activeElement;
      dialog.current.showModal();
    }
    // Back on what opened it, as the browser only does that for a dialog it
    // closes itself.
    return () => {
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      className="sheet"
      aria-labelledby={titleId}
      onCancel={(event) => {
        if (busy) event.preventDefault();
      }}
      onClose={onClose}
    >
      <span className="sheet-handle" aria-hidden="true" />
      <div className="sheet-header">
        <div className="sheet-heading">
          {eyebrow && <span className="sheet-eyebrow">{eyebrow}</span>}
          <h2 id={titleId}>{title}</h2>
        </div>
        <button type="button" className="sheet-close" aria-label={t("sheet.close")} disabled={busy} onClick={onClose}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      {children}
    </dialog>
  );
}

// A sheet asking before something happens. Cancel, Close and Escape do nothing
// but close it. If `onConfirm` returns a promise, the sheet waits for it with
// its buttons off; otherwise it closes straight away.
export function ConfirmSheet({
  eyebrow,
  title,
  body,
  confirmLabel,
  destructive = false,
  onConfirm,
  onClose,
  children,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  children?: ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Sheet eyebrow={eyebrow} title={title} busy={pending} onClose={onClose}>
      {body && <p className="sheet-body">{body}</p>}
      {children}
      <div className="sheet-actions">
        <button type="button" onClick={onClose} disabled={pending}>
          {t("sheet.cancel")}
        </button>
        <button
          type="button"
          className={destructive ? "button-delete" : "button-primary"}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await onConfirm();
              onClose();
            })
          }
        >
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}

// Deleting something nothing uses, which can't be undone.
export function DeleteSheet({
  name,
  onDelete,
  onClose,
}: {
  name: string;
  onDelete: () => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <ConfirmSheet
      eyebrow={t("sheet.remove")}
      title={t("sheet.deleteTitle", { name })}
      body={t("sheet.deleteBody", { name })}
      confirmLabel={t("sheet.delete")}
      destructive
      onConfirm={onDelete}
      onClose={onClose}
    >
      <ul className="sheet-effects">
        <li className="sheet-effect-gone">{t("sheet.deleteGone")}</li>
        <li className="sheet-effect-kept">{t("sheet.deleteAgain")}</li>
      </ul>
    </ConfirmSheet>
  );
}
