import { t } from "@/strings";

// The page a Product page was opened from, so its back link returns there. It
// travels as `?from=` and is kept by every link that leaves the Product page
// and comes back to it (Edit, older history).
export type ProductOrigin = "stock" | "shopping-list";

// Anything else, or nothing, is the Stock list, where Product pages live.
export function parseProductOrigin(value: string | string[] | undefined): ProductOrigin {
  return value === "shopping-list" ? "shopping-list" : "stock";
}

// A Product page, or its Edit page, keeping where it was opened from. `rows`
// is how much Stock history it shows.
export function productHref(
  id: string,
  from: ProductOrigin,
  { edit = false, rows }: { edit?: boolean; rows?: number } = {},
): string {
  const query = new URLSearchParams();
  if (from !== "stock") query.set("from", from);
  if (rows !== undefined) query.set("rows", String(rows));
  const search = query.size > 0 ? `?${query}` : "";
  return `/products/${id}${edit ? "/edit" : ""}${search}`;
}

// Where a Product page's back link goes, and what it says.
export function originLink(from: ProductOrigin): { href: string; label: string } {
  return from === "shopping-list"
    ? { href: "/shopping-list", label: t("shopping.title") }
    : { href: "/products", label: t("stock.title") };
}
