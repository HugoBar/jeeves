import type { StringKey } from "@/strings";

type MenuItem = { href: string; label: StringKey };
// The icon is an SVG path, drawn in the bottom menu only.
type BottomMenuItem = MenuItem & { icon: string };
type MoreLink = MenuItem & { description: StringKey };

const planner: BottomMenuItem = {
  href: "/planner",
  label: "nav.planner",
  icon: "M3 9h18M8 2v4M16 2v4M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
};
const stock: BottomMenuItem = {
  href: "/products",
  label: "nav.stock",
  icon: "M4 10h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM3 6h18v4H3z",
};
const recipes: MenuItem = { href: "/recipes", label: "nav.recipes" };
const more: BottomMenuItem = { href: "/more", label: "nav.more", icon: "M4 6h16M4 12h16M4 18h16" };

// Home is reached from the Jeeves logo, so it is in neither menu.
export const topMenu: MenuItem[] = [planner, stock, recipes, more];
export const bottomMenu: BottomMenuItem[] = [planner, stock, more];

export const moreLinks: MoreLink[] = [
  { ...recipes, description: "more.recipes" },
  { href: "/categories", label: "nav.categories", description: "more.categories" },
  { href: "/meal-types", label: "nav.mealTypes", description: "more.mealTypes" },
  { href: "/meal-templates", label: "nav.mealTemplates", description: "more.mealTemplates" },
];

// A link already in the top menu, so desktop's More page leaves it out.
export function inTopMenu(href: string): boolean {
  return topMenu.some((item) => item.href === href);
}

function isWithin(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Which item of a menu the page belongs to. A page without an item of its own
// belongs to More when the More page links to it.
export function activeMenuHref(menu: MenuItem[], pathname: string): string | null {
  const item = menu.find(({ href }) => isWithin(pathname, href));
  if (item) return item.href;
  return moreLinks.some(({ href }) => isWithin(pathname, href)) ? more.href : null;
}
