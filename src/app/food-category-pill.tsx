// A Food Category as a pill, outlined whether Role or Kind. An Archived one is
// dashed and struck through.
export function FoodCategoryPill({ label, archived = false }: { label: string; archived?: boolean }) {
  return <span className={archived ? "pill pill-archived" : "pill"}>{label}</span>;
}
