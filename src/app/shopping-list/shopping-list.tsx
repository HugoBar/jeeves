"use client";

import Link from "next/link";
import { useEffect, useOptimistic, useRef, useState, useTransition, type FormEvent } from "react";
import {
  chosenRange,
  currentChoice,
  packsCovering,
  parseItemAmount,
  stepItemAmount,
  stockUncertainty,
  type DatedShortfall,
  type DatesChoice,
  type ItemAmountError,
  type UncertainCandidate,
} from "@/core/shopping-list";
import type { ShoppingListItem } from "@/db/shopping-list";
import { formatPackName, formatPacks, formatQuantity, formatShoppingCount, t } from "@/strings";
import { useFieldErrors, WarningIcon } from "../form-error";
import { productHref } from "../products/origin";
import { ConfirmSheet } from "../sheet";
import { StepIcon } from "../stepper";
import { NEEDS_CONFIRMATION_PATH } from "../unconfirmed-alerts";
import { useViewerNow } from "../viewer-clock";
import {
  generateShoppingListAction,
  removeShoppingListItemAction,
  setAllShoppingListItemsTickedAction,
  setShoppingListItemAmountAction,
  setShoppingListItemTickedAction,
} from "./actions";
import { AddByHand, type HandAddProduct } from "./add-by-hand";
import { ChooseDates, datesLabel } from "./choose-dates";
import { RestockTicked } from "./restock-ticked";

// "Today" is the date in the viewer's time zone (spec "Platform"), which
// decides the Planner's current week and which Meals are Unconfirmed.
export function ShoppingList({
  items,
  products,
  candidates,
  shortfalls,
}: {
  items: ShoppingListItem[];
  products: HandAddProduct[];
  candidates: UncertainCandidate[];
  shortfalls: DatedShortfall[];
}) {
  return (
    <ShoppingListView
      items={items}
      today={useViewerNow()?.date ?? null}
      products={products}
      candidates={candidates}
      shortfalls={shortfalls}
    />
  );
}

// The Shopping List on `today`, or before the browser knows it (null). On
// phone From Shortfalls comes first and Restock ticked items last; from 768px
// both sit right of the list.
// `products` are the ones that can be added by hand, A to Z. `candidates` are
// the Meals that could be Unconfirmed: while some are on `today`, a banner
// says Stock is uncertain and the items their Products are on are flagged.
// `shortfalls` are each day's Shortfalls, for Running low in the add field.
export function ShoppingListView({
  items,
  today,
  products,
  candidates,
  shortfalls,
}: {
  items: ShoppingListItem[];
  today: string | null;
  products: HandAddProduct[];
  candidates: UncertainCandidate[];
  shortfalls: DatedShortfall[];
}) {
  const uncertainty = today ? stockUncertainty(candidates, today) : null;
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
      {uncertainty && uncertainty.unconfirmed > 0 && <UncertainBanner unconfirmed={uncertainty.unconfirmed} />}
      <div className="shopping-columns">
        <FromShortfalls today={today} />
        <div className="card shopping-items">
          {items.length > 0 && <h2 className="shopping-count">{formatShoppingCount(items.length)}</h2>}
          <AddByHand
            products={products}
            items={items}
            shortfalls={shortfalls}
            today={today}
            onAdded={(id) => setFresh({ id, at: Date.now() })}
          />
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
                return (
                  <ShoppingItemRow
                    key={isFresh ? `${item.id}-${fresh.at}` : item.id}
                    item={item}
                    fresh={isFresh}
                    uncertain={uncertainty?.productIds.has(item.product.id) ?? false}
                  />
                );
              })}
            </ul>
          )}
        </div>
        {ticked.length > 0 && <RestockTicked ticked={ticked} />}
      </div>
    </section>
  );
}

// Stock is uncertain while Meals are Unconfirmed: until they are Confirmed
// or Skipped, they count as eaten as planned. Review opens Needs confirmation.
function UncertainBanner({ unconfirmed }: { unconfirmed: number }) {
  return (
    <div className="banner shopping-uncertain">
      <WarningIcon />
      <p>
        <strong>{t("shopping.uncertainTitle")}</strong>{" "}
        {unconfirmed === 1 ? t("shopping.uncertainBodyOne") : t("shopping.uncertainBody", { count: unconfirmed })}{" "}
        <Link href={NEEDS_CONFIRMATION_PATH}>{t("shopping.uncertainReview")}</Link>
      </p>
    </div>
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
// An unticked item's amount opens, on the item, a way to set it; a ticked
// one's is what was bought, entered at Restock. The amount shows changed in
// place, with no highlight. `fresh` marks it just added by hand; `uncertain`
// flags a Product an Unconfirmed Meal uses.
function ShoppingItemRow({ item, fresh, uncertain }: { item: ShoppingListItem; fresh: boolean; uncertain: boolean }) {
  const [editing, setEditing] = useState(false);
  const closeEditor = () => setEditing(false);
  const [asking, setAsking] = useState(false);
  const [removing, startRemoving] = useTransition();
  const [, startTicking] = useTransition();
  const [ticked, setTicked] = useOptimistic(item.ticked);
  const { name } = item.product;
  const remove = () => removeShoppingListItemAction(item.id);
  const classes = [
    "list-row",
    "shopping-item",
    ticked && "shopping-item-ticked",
    editing && "shopping-item-editing",
    fresh && "shopping-item-fresh",
  ];
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
        <span className="shopping-item-head">
          <Link href={productHref(item.product.id, "shopping-list")} className="list-row-title shopping-item-name">
            {name}
          </Link>
          {uncertain && <span className="shopping-uncertain-pill">{t("shopping.uncertain")}</span>}
        </span>
        {ticked ? (
          <ShoppingAmount item={item} />
        ) : editing ? (
          <AmountEditor item={item} onClose={closeEditor} />
        ) : (
          <button
            type="button"
            className="shopping-amount-button"
            aria-label={t("shopping.changeAmount", { name })}
            onClick={() => setEditing(true)}
          >
            {item.quantity === null ? t("shopping.setAmount") : <ShoppingAmount item={item} />}
          </button>
        )}
      </div>
      {editing && !ticked ? (
        // Leaving the number sets what was typed before it closes.
        <button type="button" className="button-primary shopping-item-done" onClick={closeEditor}>
          {t("shopping.amountDone")}
        </button>
      ) : (
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
      )}
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

// What to buy: the whole packs that cover the amount, with the amount, as in
// "2 bags (1,000 g)", or only the amount without a Pack Size. An item added
// by hand without an amount shows none.
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
          {t("shopping.amountBesidePacks", { quantity: amount })}
        </>
      ) : (
        <strong>{amount}</strong>
      )}
    </span>
  );
}

// Sets an unticked item's amount, in place of it on the item: whole packs
// with a Pack Size, or an amount in its Default Unit without one, above 0.
// − and + step it, and the number between them can be typed over, set on
// Enter or on leaving it; its unit follows +, then, with a Pack Size, the
// amount it comes to. Each change is set at once; it stays open for the
// next, until the row's Done or Escape. An item with no amount shows an empty number, and + starts it at
// 1 pack, or one step.
function AmountEditor({
  item,
  onClose,
}: {
  item: ShoppingListItem;
  onClose: () => void;
}) {
  const { name, defaultUnit, packSize } = item.product;
  const packAmount = packSize?.amount ?? null;
  // A change shows at once, before the list comes back.
  const [quantity, setQuantity] = useOptimistic(item.quantity);
  // What is typed over the number, until it is set; null shows the amount.
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<ItemAmountError | null>(null);
  const [, startSetting] = useTransition();
  const { invalid, messages } = useFieldErrors(
    error ? [error] : [],
    () => "amount" as const,
    (found) => t(`quantity.error.${found}`),
  );

  // The number as the action reads it: whole packs with a Pack Size, else
  // the amount; empty for none.
  const asText = (amount: number | null) =>
    amount === null ? "" : String(packAmount === null ? amount : packsCovering(amount, packAmount));
  const set = (next: number) =>
    startSetting(async () => {
      setQuantity(next);
      const result = await setShoppingListItemAmountAction(item.id, asText(next));
      if (result) setError(result);
    });
  // A step's press, or null when it can't go that way.
  const step = (by: 1 | -1) => {
    const next = stepItemAmount(quantity, packAmount, defaultUnit, by);
    if (next === null) return null;
    return () => {
      setDraft(null);
      setError(null);
      set(next);
    };
  };
  const less = step(-1);
  const more = step(1);

  // Sets what was typed, read as the action reads it, unless it is the
  // amount already there.
  function setTyped() {
    if (draft === null || draft.trim() === asText(quantity)) {
      setDraft(null);
      return;
    }
    const parsed = parseItemAmount(draft, packAmount);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setDraft(null);
    set(parsed.quantity);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setTyped();
  }

  const shown = draft ?? asText(quantity);
  return (
    <div
      className="amount-editor"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <form className="amount-stepper" onSubmit={submit}>
        <button type="button" aria-label={t("shopping.less", { name })} disabled={!less} onClick={less ?? undefined}>
          <span className="amount-step">
            <StepIcon step="less" />
          </span>
        </button>
        <input
          inputMode={packSize ? "numeric" : "decimal"}
          autoComplete="off"
          aria-label={t("shopping.amountField", { name })}
          value={shown}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          onBlur={setTyped}
          {...invalid("amount")}
        />
        <button type="button" aria-label={t("shopping.more", { name })} disabled={!more} onClick={more ?? undefined}>
          <span className="amount-step">
            <StepIcon step="more" />
          </span>
        </button>
        <span className="amount-stepper-unit">
          {packSize ? formatPackName(shown.trim() === "1" ? 1 : 2, packSize.name) : t(`unit.${defaultUnit}`)}
        </span>
        {packSize && quantity !== null && (
          <span className="shopping-amount">
            {t("shopping.amountBesidePacks", { quantity: formatQuantity(quantity, defaultUnit) })}
          </span>
        )}
      </form>
      {messages("amount")}
    </div>
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
