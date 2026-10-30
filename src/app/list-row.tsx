import Link from "next/link";
import type { ReactNode } from "react";

function Chevron({ path }: { path: string }) {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d={path} />
    </svg>
  );
}

// A list row that opens a page. All of it is the link.
export function LinkRow({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="list-row">
      {children}
      <Chevron path="M9 6l6 6-6 6" />
    </Link>
  );
}

// A list row that opens for editing in place. All of it is the button, so what
// else the row can do, such as Remove, lives in the open row.
export function EditableRow({
  editLabel,
  onOpen,
  children,
}: {
  editLabel: string;
  onOpen: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className="list-row" onClick={onOpen}>
      <span className="visually-hidden">{editLabel}</span>
      {children}
      <Chevron path="M6 9l6 6 6-6" />
    </button>
  );
}
