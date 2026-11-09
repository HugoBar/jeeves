"use client";

import { plannerWeeks } from "@/core/planner";
import type { ShoppingListItem } from "@/db/shopping-list";
import { formatQuantity, formatWeekRange, t } from "@/strings";
import { useViewerNow } from "../viewer-clock";

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
            <ul className="list">
              {items.map((item) => (
                <li key={item.id} className="list-row">
                  <span className="list-row-title">{item.product.name}</span>
                  {item.quantity !== null && (
                    <span className="list-row-value">{formatQuantity(item.quantity, item.product.defaultUnit)}</span>
                  )}
                </li>
              ))}
            </ul>
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

// Generate and choosing the dates do nothing yet: their tickets add them.
function FromShortfalls({ today }: { today: string | null }) {
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
      <button type="button" className="button-primary">
        {t("shopping.generate")}
      </button>
      <p>{t("shopping.generateKeeps")}</p>
    </div>
  );
}
