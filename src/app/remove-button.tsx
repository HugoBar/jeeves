"use client";

import { useState } from "react";
import { t } from "@/strings";
import { ConfirmSheet } from "./sheet";

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
