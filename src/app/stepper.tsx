// Portions one less or one more, never below 1. Anything that isn't a whole
// number steps from 1.
export function stepPortions(amount: string, by: number): string {
  const portions = Number.parseInt(amount, 10);
  return String(Number.isNaN(portions) ? 1 : Math.max(1, portions + by));
}

// The - and + on a stepper's buttons, which carry the accessible name.
export function StepIcon({ step }: { step: "less" | "more" }) {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d={step === "less" ? "M6 12h12" : "M6 12h12M12 6v12"} />
    </svg>
  );
}
