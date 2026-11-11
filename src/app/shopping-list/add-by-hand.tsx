"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { matchesName } from "@/core/names";
import type { PackSize } from "@/core/products";
import { packsCovering, planAddByHand } from "@/core/shopping-list";
import type { DefaultUnit } from "@/core/units";
import type { ShoppingListItem } from "@/db/shopping-list";
import { formatAddPackSize, formatPacks, t } from "@/strings";
import { SearchBox } from "../search-box";
import { addProductByHandAction } from "./actions";

// A non-Archived Product, as the add field shows it.
export interface HandAddProduct {
  id: string;
  name: string;
  defaultUnit: DefaultUnit;
  packSize: PackSize | null;
}

// How many Products show, A to Z, before anything is typed.
const SHOWN_BEFORE_TYPING = 5;

// "Add a Product by hand", at the top of the list. Tapping it opens it, with
// the Products A to Z, or those whose name matches what is typed. Adding
// keeps it open for the next Product; `onAdded` gets the item added or
// changed. `products` are A to Z.
export function AddByHand({
  products,
  items,
  onAdded,
}: {
  products: HandAddProduct[];
  items: ShoppingListItem[];
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
  const matching = searching ? products.filter((product) => matchesName(product.name, typed)) : products;
  const shown = searching || showAll ? matching : matching.slice(0, SHOWN_BEFORE_TYPING);
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
          {shown.length > 0 ? (
            <ul className="hand-add-options">
              {shown.map((product) => (
                <HandAddOption key={product.id} product={product} items={items} onAdded={onAdded} />
              ))}
              {shown.length < matching.length && (
                <li>
                  <button type="button" className="hand-add-show-all" onClick={() => setShowAll(true)}>
                    {t("shopping.addShowAll", { count: matching.length })}
                  </button>
                </li>
              )}
            </ul>
          ) : (
            <p className="hand-add-none">{t("shopping.addNoMatch")}</p>
          )}
          <p className="hand-add-note">
            {t("shopping.addNoPackNote")} <Link href="/products/new">{t("shopping.addInStock")}</Link>
          </p>
        </div>
      )}
    </div>
  );
}

// One Product to add: its name, what adding does, and a button saying what
// it adds, "+ 1 box", or "+ Add" without a Pack Size.
function HandAddOption({
  product,
  items,
  onAdded,
}: {
  product: HandAddProduct;
  items: ShoppingListItem[];
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
      <span className="hand-add-status">{handAddStatus(product, items)}</span>
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
