"use client";

import type { Ref } from "react";

// A search box: a magnifier and a field, labelled by its placeholder. It
// shows dashed until `active`, as a field waiting to be opened. Match what is
// typed against names with `matchesName` from "@/core/names".
export function SearchBox({
  label,
  value,
  onChange,
  onFocus,
  active = true,
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  active?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}) {
  return (
    <div className={active ? "search-box" : "search-box search-box-idle"}>
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <input
        ref={inputRef}
        type="search"
        placeholder={label}
        aria-label={label}
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
      />
    </div>
  );
}
