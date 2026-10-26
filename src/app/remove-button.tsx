"use client";

// A Remove button that asks before submitting `action`, already bound to its id.
export function RemoveButton({
  action,
  label,
  confirmMessage,
}: {
  action: () => Promise<void>;
  label: string;
  confirmMessage: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!confirm(confirmMessage)) event.preventDefault();
      }}
    >
      <button type="submit">{label}</button>
    </form>
  );
}
