// The order lists of named things are shown in, such as the Stock list and the
// Recipes list: alphabetical, ignoring case.
export function sortByName<T extends { name: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}
