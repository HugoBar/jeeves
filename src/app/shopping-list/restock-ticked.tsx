"use client";

import { useState, useTransition, type FormEvent } from "react";
import { packsCovering, restockStart } from "@/core/shopping-list";
import type { QuantityError } from "@/core/stock";
import type { ShoppingListItem } from "@/db/shopping-list";
import { formatPacks, formatRestockSubmit, formatRestockTicked, t } from "@/strings";
import { useFieldErrors } from "../form-error";
import { Sheet } from "../sheet";
import { restockTickedItemsAction } from "./actions";

// "Restock ticked items", under the list, and the sheet it opens. `ticked`
// are the ticked items, at least one. The sheet keeps the items it opened
// with, so a list refreshed meanwhile doesn't change what it asks.
export function RestockTicked({ ticked }: { ticked: ShoppingListItem[] }) {
  const [opened, setOpened] = useState<ShoppingListItem[] | null>(null);
  return (
    <>
      <button type="button" className="button-primary shopping-restock" onClick={() => setOpened(ticked)}>
        {formatRestockTicked(ticked.length)}
      </button>
      {opened && <RestockTickedSheet items={opened} onClose={() => setOpened(null)} />}
    </>
  );
}

// One field per item for the amount bought, in its Product's Default Unit,
// starting at the whole packs that cover its amount. Restock sends them all;
// if any is rejected, nothing changes and each error shows on its field.
function RestockTickedSheet({ items, onClose }: { items: ShoppingListItem[]; onClose: () => void }) {
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((item) => [item.id, startingAmount(item)])),
  );
  const [errors, setErrors] = useState<Record<string, QuantityError>>({});
  const [pending, startTransition] = useTransition();
  const { invalid, messages } = useFieldErrors(
    Object.entries(errors),
    ([id]) => id,
    ([, error]) => t(`quantity.error.${error}`),
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const rejected = await restockTickedItemsAction(items.map(({ id }) => ({ id, amount: amounts[id]! })));
      // In the transition too, so the sheet closes as the list changes.
      startTransition(() => {
        if (rejected) setErrors(rejected);
        else onClose();
      });
    });
  }

  const title = formatRestockTicked(items.length);
  return (
    <Sheet eyebrow={t("shopping.title")} title={title} busy={pending} onClose={onClose}>
      <form className="restock-form" onSubmit={submit}>
        <p className="sheet-body">{t("shopping.restockBody")}</p>
        {items.map((item) => {
          const { name, defaultUnit } = item.product;
          const packs = packNote(item);
          return (
            <div key={item.id} className="restock-item">
              <label>
                <span className="restock-item-name">{name}</span>
                <span className="restock-item-amount">
                  <input
                    inputMode="decimal"
                    autoComplete="off"
                    value={amounts[item.id]}
                    disabled={pending}
                    onChange={(event) => {
                      const typed = event.target.value;
                      setAmounts((current) => ({ ...current, [item.id]: typed }));
                      setErrors((current) => {
                        const rest = { ...current };
                        delete rest[item.id];
                        return rest;
                      });
                    }}
                    {...invalid(item.id)}
                  />
                  <span className="restock-item-unit">{t(`unit.${defaultUnit}`)}</span>
                  {packs && <span className="restock-item-packs">{packs}</span>}
                </span>
              </label>
              {messages(item.id)}
            </div>
          );
        })}
        <div className="sheet-actions">
          <button type="button" disabled={pending} onClick={onClose}>
            {t("sheet.cancel")}
          </button>
          <button type="submit" className="button-primary" disabled={pending}>
            {formatRestockSubmit(items.length)}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

// The field's first value, plain so it reads back as typed: "2000", not
// "2,000". Empty for an item with no amount.
function startingAmount({ quantity, product }: ShoppingListItem): string {
  const start = restockStart(quantity, product.packSize?.amount ?? null);
  return start === null ? "" : String(start);
}

// The whole packs the item asked for, as in "2 cartons"; null without a Pack
// Size or an amount.
function packNote({ quantity, product: { packSize } }: ShoppingListItem): string | null {
  if (quantity === null || !packSize) return null;
  return formatPacks(packsCovering(quantity, packSize.amount), packSize.name);
}
