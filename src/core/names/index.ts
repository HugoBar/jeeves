// The most characters a name the user types can have: a Product's, a
// Recipe's, a Food Category's, a Meal Type's, a Meal Template's, a Meal's
// and a Pack Size's. Its field stops there, and saving refuses more.
export const NAME_MAX_LENGTH = 100;

// Whether text the user typed, already trimmed, is longer than `max`.
export function isTooLong(text: string, max: number): boolean {
  return text.length > max;
}

// The order lists of named things are shown in, such as the Stock list and the
// Recipes list: alphabetical, ignoring case.
export function sortByName<T extends { name: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

// A name for comparing: lower case, without accents, so "Café" reads "cafe".
function plain(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

// Whether `name` holds what was typed in a search box, ignoring case, accents
// and spaces at the ends of `typed`. Nothing typed matches every name.
export function matchesName(name: string, typed: string): boolean {
  return plain(name).includes(plain(typed.trim()));
}
