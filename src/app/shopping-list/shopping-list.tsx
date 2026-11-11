"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { plannerWeeks } from "@/core/planner";
import { packsCovering } from "@/core/shopping-list";
import type { ShoppingListItem } from "@/db/shopping-list";
import { formatPacks, formatQuantity, formatShoppingCount, formatWeekRange, t } from "@/strings";
import { productHref } from "../products/origin";
import { ConfirmSheet } from "../sheet";
import { useViewerNow } from "../viewer-clock";
import { generateShoppingListAction, removeShoppingListItemAction } from "./actions";
import { AddByHand, type HandAddProduct } from "./add-by-hand";

// "Today" is the date in the viewer's time zone (spec "Platform"), which
// decides the Planner's current week.
export function ShoppingList({ items, products }: { items: ShoppingListItem[]; products: HandAddProduct[] }) {
  return <ShoppingListView items={items} today={useViewerNow()?.date ?? null} products={products} />;
}

// The Shopping List on `today`, or before the browser knows it (null). On
// phone From Shortfalls comes first; from 768px it sits right of the list.
// `products` are the ones that can be added by hand, A to Z.
export function ShoppingListView({
  items,
  today,
  products,
}: {
  items: ShoppingListItem[];
  today: string | null;
  products: HandAddProduct[];
}) {
  // The item just added or changed by hand, shown with a fading highlight.
  // `at` tells one add from the next, so the highlight plays again.
  const [fresh, setFresh] = useState<{ id: string; at: number } | null>(null);
  return (
    <section className="page-wide">
      <h1 className="shopping-title">{t("shopping.title")}</h1>
      <div className="shopping-columns">
        <FromShortfalls today={today} />
        <div className="card shopping-items">
          {items.length > 0 && <h2 className="shopping-count">{formatShoppingCount(items.length)}</h2>}
          <AddByHand products={products} items={items} onAdded={(id) => setFresh({ id, at: Date.now() })} />
          {items.length === 0 ? (
            <div className="shopping-empty">
              <strong>{t("shopping.empty")}</strong>
              <p>{t("shopping.emptyHint")}</p>
            </div>
          ) : (
            <ul className="list shopping-list">
              {items.map((item) => {
                const isFresh = fresh?.id === item.id;
                // A new key replays the highlight when the same item changes again.
                return <ShoppingItemRow key={isFresh ? `${item.id}-${fresh.at}` : item.id} item={item} fresh={isFresh} />;
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

// One item: its Product, linking to the Product's page, what to buy, and ✕,
// which takes it off the list. Removing is quick and an item is easy to add
// again, so ✕ asks only for a ticked item: it is bought, and once removed,
// Restock won't add it to Stock.
// `fresh` marks it just added or changed by hand.
function ShoppingItemRow({ item, fresh }: { item: ShoppingListItem; fresh: boolean }) {
  const [asking, setAsking] = useState(false);
  const [removing, startRemoving] = useTransition();
  const { name } = item.product;
  const remove = () => removeShoppingListItemAction(item.id);
  return (
    <li className={fresh ? "list-row shopping-item shopping-item-fresh" : "list-row shopping-item"}>
      <div className="list-row-text">
        <Link href={productHref(item.product.id, "shopping-list")} className="list-row-title shopping-item-name">
          {name}
        </Link>
        <ShoppingAmount item={item} />
      </div>
      <button
        type="button"
        className="shopping-item-remove"
        aria-label={t("shopping.remove", { name })}
        disabled={removing}
        onClick={() => (item.ticked ? setAsking(true) : startRemoving(remove))}
      >
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      {asking && (
        <ConfirmSheet
          eyebrow={t("shopping.title")}
          title={t("shopping.removeTitle", { name })}
          body={t("shopping.removeTickedBody")}
          confirmLabel={t("sheet.remove")}
          destructive
          onConfirm={remove}
          onClose={() => setAsking(false)}
        />
      )}
    </li>
  );
}

// What to buy: the whole packs that cover the amount, with the amount needed,
// as in "1 bag (100 g needed)", or only the amount without a Pack Size. An
// item added by hand without an amount shows none.
function ShoppingAmount({ item }: { item: ShoppingListItem }) {
  const { quantity, product } = item;
  if (quantity === null) return null;
  const amount = formatQuantity(quantity, product.defaultUnit);
  const { packSize } = product;
  return (
    <span className="shopping-amount">
      {packSize ? (
        <>
          <strong>{formatPacks(packsCovering(quantity, packSize.amount), packSize.name)}</strong>{" "}
          {t("shopping.needed", { quantity: amount })}
        </>
      ) : (
        <strong>{amount}</strong>
      )}
    </span>
  );
}

// Choosing the dates does nothing yet: its ticket adds it. Generate waits for
// the viewer's date, which decides the week.
function FromShortfalls({ today }: { today: string | null }) {
  const [pending, startTransition] = useTransition();
  let dates = t("shopping.plannedWeek");
  if (today) {
    const { thisWeek } = plannerWeeks(today);
    dates = t("shopping.plannedWeekDates", { dates: formatWeekRange(thisWeek[0]!, thisWeek.at(-1)!) });
  }
  return (
    <div className="card shopping-generate">
      <h2>{t("shopping.fromShortfalls")}</h2>
      <button type="button" className="shopping-dates">
        {dates}
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
      <button
        type="button"
        className="button-primary"
        disabled={!today || pending}
        onClick={() => {
          if (today) startTransition(() => generateShoppingListAction(today));
        }}
      >
        {t("shopping.generate")}
      </button>
      <p>{t("shopping.generateKeeps")}</p>
    </div>
  );
}
