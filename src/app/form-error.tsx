import { Fragment, useId, type ReactNode } from "react";

// An error message with its icon.
export function FormError({ children }: { children: ReactNode }) {
  return (
    <p className="form-error">
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5M12 16.5v.01" />
      </svg>
      {children}
    </p>
  );
}

// What marks a field as having an error.
export type InvalidProps = { "aria-invalid"?: true; "aria-describedby"?: string };

// A form's errors, each on its field. Spread `invalid(field)` on the field for
// its red border, and show `messages(field)` under it. A form whose fields sit
// in a row shows `allMessages()` under the row instead.
export function useFieldErrors<E, F extends string>(
  errors: readonly E[],
  fieldOf: (error: E) => F,
  message: (error: E) => string,
) {
  const id = useId();
  const byField = new Map<F, E[]>();
  for (const error of errors) byField.set(fieldOf(error), [...(byField.get(fieldOf(error)) ?? []), error]);
  const errorId = (field: F) => `${id}-${field}`;

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
      byField.has(field) ? { "aria-invalid": true, "aria-describedby": errorId(field) } : {},
    messages,
    allMessages: () => [...byField.keys()].map((field) => <Fragment key={field}>{messages(field)}</Fragment>),
  };
}
