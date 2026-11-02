import type { RemoveOutcome } from "@/db/archive";
import { t } from "@/strings";
import { ArchiveOrDeleteButton } from "./remove-button";
import type { SheetEffect } from "./sheet";

// A page's Remove card: it says whether Remove will delete or Archive, and its
// button opens the matching sheet. `inUse` is the in-use sentence, with
// "{archived}" where the bold "Archived" goes. `archiveEffects` lists what
// Archiving means for this thing.
export function RemoveCard({
  className,
  name,
  outcome,
  inUse,
  archiveEffects,
  action,
}: {
  className: string;
  name: string;
  outcome: RemoveOutcome;
  inUse: string;
  archiveEffects: SheetEffect[];
  action: () => Promise<void>;
}) {
  return (
    <div className={`card ${className}`}>
      <h2>{t("sheet.remove")}</h2>
      {outcome === "archived" ? <InUseNote text={inUse} /> : <p>{t("sheet.deleteBody", { name })}</p>}
      <ArchiveOrDeleteButton name={name} outcome={outcome} archiveEffects={archiveEffects} action={action} />
    </div>
  );
}

// "Archived" is bold, so it sits between the sentence's two parts.
function InUseNote({ text }: { text: string }) {
  const [before, after] = text.split("{archived}");
  return (
    <p>
      {before}
      <strong>{t("sheet.removeArchived")}</strong>
      {after}
    </p>
  );
}
