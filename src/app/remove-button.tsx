"use client";

import { useState } from "react";
import type { RemoveOutcome } from "@/db/archive";
import { t } from "@/strings";
import { ArchiveSheet, ConfirmSheet, DeleteSheet, type SheetEffect } from "./sheet";

// A Remove button that asks in a sheet before running `action`, already bound
// to its id.
export function RemoveButton({
  action,
  label,
  title,
  body,
}: {
  action: () => Promise<void>;
  label: string;
  title: string;
  body?: string;
}) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <button type="button" className="button-danger" onClick={() => setAsking(true)}>
        {label}
      </button>
      {asking && (
        <ConfirmSheet
          eyebrow={t("sheet.remove")}
          title={title}
          body={body}
          confirmLabel={label}
          destructive
          onConfirm={action}
          onClose={() => setAsking(false)}
        />
      )}
    </>
  );
}

// A button that names what Remove will do and opens the matching sheet. The
// sheet stays as it was opened until it closes, so it doesn't swap for the
// other one when `action` finds that `outcome` no longer holds.
export function ArchiveOrDeleteButton({
  name,
  outcome,
  archiveEffects,
  action,
}: {
  name: string;
  outcome: RemoveOutcome;
  archiveEffects: SheetEffect[];
  action: () => Promise<void>;
}) {
  const [opened, setOpened] = useState<RemoveOutcome | null>(null);
  const close = () => setOpened(null);
  return (
    <>
      <button type="button" className="button-danger" onClick={() => setOpened(outcome)}>
        {t(outcome === "archived" ? "sheet.archiveName" : "sheet.deleteName", { name })}
      </button>
      {opened === "archived" && (
        <ArchiveSheet name={name} effects={archiveEffects} onArchive={action} onClose={close} />
      )}
      {opened === "deleted" && <DeleteSheet name={name} onDelete={action} onClose={close} />}
    </>
  );
}
