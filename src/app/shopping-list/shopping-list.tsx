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

// "Today" is the date in the viewer's time zone (spec "Platform"), which
// decides the Planner's current week.
export function ShoppingList({ items }: { items: ShoppingListItem[] }) {
  return <ShoppingListView items={items} today={useViewerNow()?.date ?? null} />;
}

// The Shopping List on `today`, or before the browser knows it (null). On
// phone From Shortfalls comes first; from 768px it sits right of the list.
export function ShoppingListView({ items, today }: { items: ShoppingListItem[]; today: string | null }) {
  return (
    <section className="page-wide">
      <h1 className="shopping-title">{t("shopping.title")}</h1>
      <div className="shopping-columns">
        <FromShortfalls today={today} />
        <div className="card shopping-items">
          {items.length === 0 ? (
            <div className="shopping-empty">
              <strong>{t("shopping.empty")}</strong>
              <p>{t("shopping.emptyHint")}</p>
            </div>
          ) : (
            <>
              <h2 className="shopping-count">{formatShoppingCount(items.length)}</h2>
              <ul className="list shopping-list">
                {items.map((item) => (
                  <ShoppingItemRow key={item.id} item={item} />
                ))}
              </ul>
            </>
          )}
          {/* Adding by hand comes with its own ticket. */}
          <div className="shopping-add">
            <input type="text" placeholder={t("shopping.addByHand")} aria-label={t("shopping.addByHand")} />
            <button type="button" className="button-soft button-add shopping-add-button" aria-label={t("shopping.addByHand")} />
          </div>
        </div>
      </div>
    </section>
  );
}

// One item: its Product, linking to the Product's page, what to buy, and ✕,
// which takes it off the list. Removing is quick and an item is easy to add
// again, so ✕ asks only for a ticked item: it is bought, and once removed,
// Restock won't add it to Stock.
function ShoppingItemRow({ item }: { item: ShoppingListItem }) {
  const [asking, setAsking] = useState(false);
  const [removing, startRemoving] = useTransition();
  const { name } = item.product;
  const remove = () => removeShoppingListItemAction(item.id);
  return (
    <li className="list-row shopping-item">
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
