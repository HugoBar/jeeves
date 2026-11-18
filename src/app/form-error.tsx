import { Fragment, useId, useState, type ReactNode, type Ref, type SyntheticEvent } from "react";

// The alert icon beside an error or warning.
export function AlertIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16.5v.01" />
    </svg>
  );
}

// The warning triangle beside a warning that blocks nothing.
export function WarningIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z" />
      <path d="M12 9.5v4M12 17h.01" />
    </svg>
  );
}

// The lock beside a field that can't be changed.
export function LockIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="6" y="11" width="12" height="9" rx="2" />
      <path d="M9 11V8a3 3 0 0 1 6 0v3" />
    </svg>
  );
}

// An error message with its icon.
export function FormError({ children }: { children: ReactNode }) {
  return (
    <p className="form-error">
      <AlertIcon />
      {children}
    </p>
  );
}

// The same for something allowed, but worth a second look.
export function FormWarning({ children }: { children: ReactNode }) {
  return (
    <p className="form-error form-warning">
      <AlertIcon />
      {children}
    </p>
  );
}

// What's wrong with a rejected form as a whole, above its fields.
export function FormBanner({ ref, children }: { ref?: Ref<HTMLDivElement>; children: ReactNode }) {
  return (
    <div ref={ref} role="alert" className="banner banner-error">
      <AlertIcon />
      <p>{children}</p>
    </div>
  );
}

// A form's text fields as its submit sends them, for a LiveErrors check.
export function formFields(form: HTMLFormElement): (name: string) => string {
  const data = new FormData(form);
  return (name) => {
    const value = data.get(name);
    return typeof value === "string" ? value : "";
  };
}

// What marks a field as having an error, and names the field it belongs to.
export type InvalidProps = { "aria-invalid"?: true; "aria-describedby"?: string; "data-field"?: string };

// How a form's errors follow what is typed after they were shown: `from` is
// what they came with, such as the form's action state, so they show again
// in full once it changes. `check` reads the form as the server would and
// says what is wrong now, so a field left still wrong shows its error again.
export interface LiveErrors<E> {
  from: unknown;
  check?: (form: HTMLFormElement) => readonly E[];
}

// A form's errors, each on its field. Spread `invalid(field)` on the field for
// its red border, and show `messages(field)` under it. A form whose fields sit
// in a row shows `allMessages()` under the row instead. With `live`, spread
// `watch` on the form or on an element holding the fields: a field's error
// goes as soon as it changes, and on leaving it, it is checked again.
// `changed(field)` marks a change made by a button rather than by typing.
export function useFieldErrors<E, F extends string>(
  errors: readonly E[],
  fieldOf: (error: E) => F,
  message: (error: E) => string,
  live?: LiveErrors<E>,
) {
  const id = useId();
  const [shownFrom, setShownFrom] = useState(live?.from);
  // Fields changed since the errors came, and what checking them again found.
  const [changedFields, setChangedFields] = useState<ReadonlySet<F>>(new Set());
  const [rechecked, setRechecked] = useState<ReadonlyMap<F, readonly E[]>>(new Map());
  if (shownFrom !== live?.from) {
    setShownFrom(live?.from);
    setChangedFields(new Set());
    setRechecked(new Map());
  }

  const shown = [
    ...errors.filter((error) => !changedFields.has(fieldOf(error))),
    ...[...rechecked.values()].flat(),
  ];
  const byField = new Map<F, E[]>();
  for (const error of shown) byField.set(fieldOf(error), [...(byField.get(fieldOf(error)) ?? []), error]);
  const errorId = (field: F) => `${id}-${field}`;

  function changed(field: F) {
    setChangedFields((current) => (current.has(field) ? current : new Set(current).add(field)));
    setRechecked((current) => {
      if (!current.has(field)) return current;
      const next = new Map(current);
      next.delete(field);
      return next;
    });
  }

  const fieldOfEvent = (event: SyntheticEvent) =>
    (event.target as Element).closest("[data-field]")?.getAttribute("data-field") as F | undefined;
  const watch = {
    onChange: (event: SyntheticEvent) => {
      const field = fieldOfEvent(event);      if (field !== undefined) changed(field);
    },
    onBlur: (event: SyntheticEvent) => {
      const field = fieldOfEvent(event);
      const form = (event.target as Element).closest("form");
      if (field === undefined || !changedFields.has(field) || !live?.check || !form) return;
      const found = live.check(form).filter((error) => fieldOf(error) === field);
      setRechecked((current) => new Map(current).set(field, found));
    },
  };

  function messages(field: F) {
    const fieldErrors = byField.get(field);
    if (!fieldErrors) return null;
    return (
      <div id={errorId(field)} className="field-errors">
        {fieldErrors.map((error) => (
          <FormError key={message(error)}>{message(error)}</FormError>
        ))}
      </div>
    );
  }

  return {
    invalid: (field: F): InvalidProps =>
      byField.has(field)
        ? { "aria-invalid": true, "aria-describedby": errorId(field), "data-field": field }
        : { "data-field": field },
    messages,
    allMessages: () => [...byField.keys()].map((field) => <Fragment key={field}>{messages(field)}</Fragment>),
    // How many errors show now, for a banner counting them.
    shownCount: shown.length,
    watch,
    changed,
  };
}
