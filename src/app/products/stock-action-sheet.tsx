"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent, type RefObject } from "react";
import { previewStockAction, STOCK_ACTIONS, type QuantityError, type StockAction } from "@/core/stock";
import type { Product } from "@/db/products";
import { formatPackSizeNote, formatQuantity, t } from "@/strings";
import { FormWarning, useFieldErrors } from "../form-error";
import { Sheet } from "../sheet";

// Runs a Stock action on the amount as typed. Returns why it was rejected.
export type StockActionRunners = Record<StockAction, (amount: string) => Promise<QuantityError | null>>;

// Restock, Discard and Correction, each opening the sheet on its tab.
export function StockActions({ product, actions }: { product: Product; actions: StockActionRunners }) {
  const [opened, setOpened] = useState<StockAction | null>(null);
  return (
    <>
      <div className="stock-card-actions">
        {STOCK_ACTIONS.map((action) => (
          <button
            key={action}
            type="button"
            className={action === "restock" ? "button-primary" : undefined}
            onClick={() => setOpened(action)}
          >
            {t(`stockMovement.${action}`)}
          </button>
        ))}
      </div>
      {opened && (
        <StockActionSheet product={product} actions={actions} initialAction={opened} onClose={() => setOpened(null)} />
      )}
    </>
  );
}

// One sheet for the three Stock actions, with a tab for each. A tab starts
// empty, as an amount typed for one means something else on another.
export function StockActionSheet({
  product,
  actions,
  initialAction,
  onClose,
}: {
  product: Product;
  actions: StockActionRunners;
  initialAction: StockAction;
  onClose: () => void;
}) {
  const [action, setAction] = useState(initialAction);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<QuantityError | null>(null);
  const [pending, startTransition] = useTransition();
  const field = useRef<HTMLInputElement>(null);

  // Runs after Sheet's own effect, which opens the dialog and moves focus.
  useEffect(() => field.current?.focus(), [action]);

  function switchTo(next: StockAction) {
    setAction(next);
    setAmount("");
    setError(null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const rejected = await actions[action](amount);
      // In the transition too, so the sheet closes as the new Stock shows.
      startTransition(() => {
        if (rejected) setError(rejected);
        else onClose();
      });
    });
  }

  return (
    <Sheet
      eyebrow={t("stockAction.eyebrow")}
      title={t("stockAction.title", { action: t(`stockMovement.${action}`), name: product.name })}
      busy={pending}
      onClose={onClose}
    >
      <div className="stock-action-tabs" role="group" aria-label={t("stockAction.eyebrow")}>
        {STOCK_ACTIONS.map((tab) => (
          <button key={tab} type="button" aria-pressed={tab === action} disabled={pending} onClick={() => switchTo(tab)}>
            {t(`stockMovement.${tab}`)}
          </button>
        ))}
      </div>
      <StockActionForm
        action={action}
        product={product}
        amount={amount}
        error={error}
        pending={pending}
        fieldRef={field}
        onAmountChange={(typed) => {
          setAmount(typed);
          setError(null);
        }}
        onCancel={onClose}
        onSubmit={submit}
      />
    </Sheet>
  );
}

// The amount, what it will do to Stock, and the buttons. Under the amount
// shows one thing: an error, else the Discard warning, else its explanation.
export function StockActionForm({
  action,
  product,
  amount,
  error,
  pending,
  fieldRef,
  onAmountChange,
  onCancel,
  onSubmit,
}: {
  action: StockAction;
  product: Product;
  amount: string;
  error: QuantityError | null;
  pending: boolean;
  fieldRef: RefObject<HTMLInputElement | null>;
  onAmountChange: (amount: string) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const { defaultUnit, name, stock } = product;
  const preview = previewStockAction(action, product, amount);
  const clamped = preview?.clamped ?? false;
  const { invalid, messages } = useFieldErrors(
    error ? [error] : [],
    () => "amount",
    (quantityError) => t(`quantity.error.${quantityError}`),
  );
  const noteId = useId();
  const hint = stockActionHint(action, product);
  const inCurrentStock = formatQuantity(stock, defaultUnit);

  return (
    <form className="stock-action-form" onSubmit={onSubmit}>
      <div className="stock-action-amount">
        <label>
          {t(`${action}.quantity`)}
          <span className={clamped ? "field-joined field-warning" : "field-joined"}>
            <input
              ref={fieldRef}
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              aria-describedby={noteId}
              onChange={(event) => onAmountChange(event.target.value)}
              {...invalid("amount")}
            />
            <span className="field-unit">{t(`unit.${defaultUnit}`)}</span>
          </span>
        </label>
        {error ? (
          messages("amount")
        ) : (
          <div id={noteId}>
            {clamped ? (
              <FormWarning>
                {t("discard.warning", { stock: inCurrentStock, name, flag: t("stock.suspect") })}
              </FormWarning>
            ) : (
              hint && <p className="field-hint">{hint}</p>
            )}
          </div>
        )}
      </div>
      <div className="stock-after">
        <span>{t("stockAction.stockAfter")}</span>
        <output>
          {t("stockAction.from", { stock: inCurrentStock })}{" "}
          <strong>{preview ? formatQuantity(preview.resultingQuantity, defaultUnit) : t("stockAction.unknown")}</strong>
        </output>
      </div>
      <div className="sheet-actions">
        <button type="button" disabled={pending} onClick={onCancel}>
          {t("sheet.cancel")}
        </button>
        <button type="submit" className="button-primary" disabled={pending}>
          {clamped ? t("discard.submitAnyway") : t(`${action}.submit`)}
        </button>
      </div>
    </form>
  );
}

function stockActionHint(action: StockAction, { packSize, defaultUnit }: Product): string | null {
  if (action !== "restock") return t(`${action}.hint`);
  return packSize && formatPackSizeNote(packSize, defaultUnit);
}
