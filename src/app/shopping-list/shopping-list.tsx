"use client";

import Link from "next/link";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { chosenRange, currentChoice, packsCovering, type DatesChoice } from "@/core/shopping-list";
import type { ShoppingListItem } from "@/db/shopping-list";
import { formatPacks, formatQuantity, formatShoppingCount, t } from "@/strings";
import { productHref } from "../products/origin";
import { ConfirmSheet } from "../sheet";
import { useViewerNow } from "../viewer-clock";
import {
  generateShoppingListAction,
  removeShoppingListItemAction,
  setAllShoppingListItemsTickedAction,
  setShoppingListItemTickedAction,
} from "./actions";
import { AddByHand, type HandAddProduct } from "./add-by-hand";
import { ChooseDates, datesLabel } from "./choose-dates";

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
  // Ticking or unticking every item shows at once, before the list comes back.
  const [shown, setAllTicked] = useOptimistic(items, (current, ticked: boolean) =>
    current.map((item) => ({ ...item, ticked })),
  );
  const ticked = shown.filter((item) => item.ticked);
  return (
    <section className="page-wide">
      <h1 className="shopping-title">{t("shopping.title")}</h1>
      <div className="shopping-columns">
        <FromShortfalls today={today} />
        <div className="card shopping-items">
          {items.length > 0 && <h2 className="shopping-count">{formatShoppingCount(items.length)}</h2>}
          <AddByHand products={products} items={items} onAdded={(id) => setFresh({ id, at: Date.now() })} />
          {items.length > 0 && <TickAll ticked={ticked.length} total={shown.length} onTick={setAllTicked} />}
          {items.length === 0 ? (
            <div className="shopping-empty">
              <strong>{t("shopping.empty")}</strong>
              <p>{t("shopping.emptyHint")}</p>
            </div>
          ) : (
            <ul className="list shopping-list">
              {shown.map((item) => {
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

// "Tick all", under the field for adding by hand, its box lined up with the
// items' boxes: ticked when all are, half-filled when some are. Pressing it
// ticks them all, or unticks them all when all are ticked.
// `onTick` shows the change before the list comes back.
function TickAll({ ticked, total, onTick }: { ticked: number; total: number; onTick: (ticked: boolean) => void }) {
  const box = useRef<HTMLInputElement>(null);
  const [, startTicking] = useTransition();
  const some = ticked > 0 && ticked < total;
  // A half-filled box can only be set from script.
  useEffect(() => {
    if (box.current) box.current.indeterminate = some;
  }, [some]);
  return (
    <label className="shopping-tick-all">
      <input
        ref={box}
        type="checkbox"
        className="shopping-item-tick"
        checked={ticked === total}
        onChange={() => {
          const next = ticked < total;
          startTicking(async () => {
            onTick(next);
            await setAllShoppingListItemsTickedAction(next);
          });
        }}
      />
      {t("shopping.tickAll")}
    </label>
  );
}

// One item: its tick, its Product, linking to the Product's page, what to
// buy, and ✕, which takes it off the list. Ticking marks it bought and
// strikes its name through, at once, before the list comes back. Removing is
// quick and an item is easy to add again, so ✕ asks only for a ticked item:
// it is bought, and once removed, Restock won't add it to Stock.
// `fresh` marks it just added or changed by hand.
function ShoppingItemRow({ item, fresh }: { item: ShoppingListItem; fresh: boolean }) {
  const [asking, setAsking] = useState(false);
  const [removing, startRemoving] = useTransition();
  const [, startTicking] = useTransition();
  const [ticked, setTicked] = useOptimistic(item.ticked);
  const { name } = item.product;
  const remove = () => removeShoppingListItemAction(item.id);
  const classes = ["list-row", "shopping-item", ticked && "shopping-item-ticked", fresh && "shopping-item-fresh"];
  return (
    <li className={classes.filter(Boolean).join(" ")}>
      <input
        type="checkbox"
        className="shopping-item-tick"
        aria-label={t("shopping.tick", { name })}
        checked={ticked}
        onChange={(event) => {
          const next = event.target.checked;
          startTicking(async () => {
            setTicked(next);
            await setShoppingListItemTickedAction(item.id, next);
          });
        }}
      />
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
        onClick={() => (ticked ? setAsking(true) : startRemoving(remove))}
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

// Generate over the chosen dates, which start as the planned week each time
// the page opens. Choosing them and Generate wait for the viewer's date,
// which decides the Planner's weeks.
function FromShortfalls({ today }: { today: string | null }) {
  const [pending, startTransition] = useTransition();
  const [choice, setChoice] = useState<DatesChoice>({ preset: "planned" });
  const [choosing, setChoosing] = useState(false);
  const current = today ? currentChoice(choice, today) : choice;
  return (
    <div className="card shopping-generate">
      <h2>{t("shopping.fromShortfalls")}</h2>
      <button type="button" className="shopping-dates" disabled={!today} onClick={() => setChoosing(true)}>
        {datesLabel(current, today)}
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
      {choosing && today && (
        <ChooseDates
          today={today}
          choice={current}
          onUse={(chosen) => {
            setChoice(chosen);
            setChoosing(false);
          }}
          onClose={() => setChoosing(false)}
        />
      )}
      <button
        type="button"
        className="button-primary"
        disabled={!today || pending}
        onClick={() => {
          if (today) startTransition(() => generateShoppingListAction(today, chosenRange(current, today)));
        }}
      >
        {t("shopping.generate")}
      </button>
      <p>{t("shopping.generateKeeps")}</p>
    </div>
  );
}
