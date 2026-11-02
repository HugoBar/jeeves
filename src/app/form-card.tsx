import type { ReactNode } from "react";

// A card of a form's fields, with its title and an optional hint under it.
export function FormCard({
  title,
  hint,
  className = "",
  children,
}: {
  title: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`card form-card ${className}`}>
      <div>
        <h2>{title}</h2>
        {hint && <p className="field-hint">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
