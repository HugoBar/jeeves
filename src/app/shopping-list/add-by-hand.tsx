"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { matchesName } from "@/core/names";
import type { PackSize } from "@/core/products";
import {
  generatePresets,
  packsCovering,
  planAddByHand,
  runningLow,
  type DatedShortfall,
  type RunningLowReason,
} from "@/core/shopping-list";
import type { DefaultUnit } from "@/core/units";
import type { ShoppingListItem } from "@/db/shopping-list";
import { formatAddPackSize, formatMealDate, formatPacks, formatQuantity, t } from "@/strings";
import { SearchBox } from "../search-box";
import { addProductByHandAction } from "./actions";

// A non-Archived Product, as the add field shows it.
export interface HandAddProduct {
  id: string;
  name: string;
  defaultUnit: DefaultUnit;
  packSize: PackSize | null;
  // In its Default Unit.
  stock: number;
}

// How many Products show, A to Z, before anything is typed.
const SHOWN_BEFORE_TYPING = 5;

// "Add a Product by hand", at the top of the list. Tapping it opens it, with
// Running low first and the other Products A to Z under it, or with the
// Products whose name matches what is typed. Adding keeps it open for the
// next Product; `onAdded` gets the item added or changed. `products` are A to
// Z. `shortfalls` are each day's Shortfalls, as the Planner works them out;
// Running low takes those in the Planner's two weeks on `today`, the viewer's
// date, and waits for it.
export function AddByHand({
  products,
  items,
  shortfalls,
  today,
  onAdded,
}: {
  products: HandAddProduct[];
  items: ShoppingListItem[];
  shortfalls: DatedShortfall[];
  today: string | null;
  onAdded: (itemId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [showAll, setShowAll] = useState(false);
  const close = () => {
    setOpen(false);
    setTyped("");
    setShowAll(false);
  };
  const searching = typed.trim() !== "";
  const low =
    searching || !today
      ? []
      : runningLow(products, shortfalls, new Set(items.map((item) => item.product.id)), generatePresets(today).both);
  const lowIds = new Set(low.map((each) => each.productId));
  const matching = searching
    ? products.filter((product) => matchesName(product.name, typed))
    : products.filter((product) => !lowIds.has(product.id));
  const shown = searching || showAll ? matching : matching.slice(0, SHOWN_BEFORE_TYPING);
  const byId = new Map(products.map((product) => [product.id, product]));
  return (
    <div className="hand-add">
      <div className="hand-add-field">
        <SearchBox
          label={t("shopping.addByHand")}
          value={typed}
          onChange={setTyped}
          onFocus={() => setOpen(true)}
          active={open}
        />
        {open && (
          <button type="button" className="hand-add-cancel" onClick={close}>
            {t("sheet.cancel")}
          </button>
        )}
      </div>
      {open && (
        <div className="hand-add-panel">
          {low.length > 0 && (
            <div className="hand-add-low">
              <p className="hand-add-heading">
                <strong>{t("shopping.runningLow")}</strong> <span>{t("shopping.runningLowNote")}</span>
              </p>
              <ul className="hand-add-options">
                {low.map(({ productId, reason }) => {
                  const product = byId.get(productId)!;
                  return (
                    <HandAddOption
                      key={productId}
                      product={product}
                      status={lowStatus(reason, product)}
                      onAdded={onAdded}
                    />
                  );
                })}
              </ul>
            </div>
          )}
          {shown.length > 0 && (
            <div className="hand-add-others">
              {low.length > 0 && <p className="hand-add-heading">{t("shopping.allOtherProducts")}</p>}
              <ul className="hand-add-options">
                {shown.map((product) => (
                  <HandAddOption
                    key={product.id}
                    product={product}
                    status={handAddStatus(product, items)}
                    onAdded={onAdded}
                  />
                ))}
                {shown.length < matching.length && (
                  <li>
                    <button type="button" className="hand-add-show-all" onClick={() => setShowAll(true)}>
                      {t("shopping.addShowAll", { count: matching.length })}
                    </button>
                  </li>
                )}
              </ul>
            </div>
          )}
          {shown.length === 0 && low.length === 0 && <p className="hand-add-none">{t("shopping.addNoMatch")}</p>}
          <p className="hand-add-note">
            {t("shopping.addNoPackNote")} <Link href="/products/new">{t("shopping.addInStock")}</Link>
          </p>
        </div>
      )}
    </div>
  );
}

// One Product to add: its name, `status`, what adding does or why it is
// running low, and a button saying what it adds, "+ 1 box", or "+ Add"
// without a Pack Size.
function HandAddOption({
  product,
  status,
  onAdded,
}: {
  product: HandAddProduct;
  status: string;
  onAdded: (itemId: string) => void;
}) {
  const [adding, startAdding] = useTransition();
  const { name, packSize } = product;
  const pack = packSize ? formatPacks(1, packSize.name) : null;
  const add = () =>
    startAdding(async () => {
      const itemId = await addProductByHandAction(product.id);
      if (itemId) onAdded(itemId);
    });
  return (
    <li className="hand-add-option">
      <span className="hand-add-name">{name}</span>
      <span className="hand-add-status">{status}</span>
      <button
        type="button"
        className="button-soft button-add hand-add-button"
        aria-label={pack ? t("shopping.addPackOf", { packs: pack, name }) : t("shopping.addName", { name })}
        disabled={adding}
        onClick={add}
      >
        {pack ?? t("shopping.addPlain")}
      </button>
    </li>
  );
}

// What adding the Product does, as planAddByHand works it out: adds to its
// unticked item, leaves it as it is, or goes on a new line beside ticked
// ones. Not on the list, its Pack Size.
function handAddStatus({ id, defaultUnit, packSize }: HandAddProduct, items: ShoppingListItem[]): string {
  const own = items.filter((item) => item.product.id === id);
  const plan = planAddByHand(packSize?.amount ?? null, own.map((item) => ({ ...item, productId: id })));
  if (plan.kind === "keep") return t("shopping.addStays");
  if (plan.kind === "raise") {
    const { quantity } = own.find((item) => item.id === plan.id)!;
    if (quantity === null || !packSize) return t("shopping.addAddsToIt");
    return t("shopping.addAddsTo", { packs: formatPacks(packsCovering(quantity, packSize.amount), packSize.name) });
  }
  if (own.length > 0) return t("shopping.addTicked");
  return packSize ? formatAddPackSize(packSize, defaultUnit) : t("shopping.addNoPackSize");
}

// Why a Product is running low: "0 g in Stock", or "Short 4 pc on Tue 3 Nov".
function lowStatus(reason: RunningLowReason, { stock, defaultUnit }: HandAddProduct): string {
  if (reason.kind === "outOfStock") return t("shopping.lowOutOfStock", { quantity: formatQuantity(stock, defaultUnit) });
  return t("shopping.lowShort", {
    quantity: formatQuantity(reason.amount, defaultUnit),
    date: formatMealDate(reason.date),
  });
}
