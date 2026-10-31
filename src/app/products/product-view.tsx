import Link from "next/link";
import { STOCK_HISTORY_PAGE_SIZE } from "@/core/stock";
import type { DefaultUnit } from "@/core/units";
import type { RemoveOutcome } from "@/db/archive";
import type { Product } from "@/db/products";
import type { StockMovement } from "@/db/stock-movements";
import { formatDelta, formatMovementMeal, formatPackSize, formatQuantity, t } from "@/strings";
import type { CategoryOption } from "../categories/category-options";
import { FoodCategoryPill } from "../food-category-pill";
import { BackLink } from "../list-row";
import { LocalDate } from "../local-date";
import { ArchiveOrDeleteButton } from "../remove-button";
import { StockActions, type StockActionRunners } from "./stock-action-sheet";

// A Product: its Stock, the Restock, Discard and Correction sheet, its Details,
// its Stock Movement history and Remove. Pills follow the order of
// `categories`, which also holds their labels. `movements` run newest first:
// the `rows` asked for, and `hasOlder` says if there are more. `removeOutcome`
// is what Remove would do.
export function ProductView({
  product,
  categories,
  movements,
  rows,
  hasOlder,
  removeOutcome,
  actions,
}: {
  product: Product;
  categories: CategoryOption[];
  movements: StockMovement[];
  rows: number;
  hasOlder: boolean;
  removeOutcome: RemoveOutcome;
  actions: StockActionRunners & { remove: () => Promise<void> };
}) {
  const productCategories = categories.filter((category) => product.categoryIds.includes(category.id));
  return (
    <section className="page-wide">
      <BackLink href="/products">{t("stock.title")}</BackLink>
      <div className="product-heading">
        <h1>{product.name}</h1>
        <Link href={`/products/${product.id}/edit`} className="button">
          <span className="phone-only">{t("products.edit")}</span>
          <span className="desktop-only">{t("products.editProduct")}</span>
        </Link>
        {productCategories.length > 0 && (
          <span className="pills">
            {productCategories.map((category) => (
              <FoodCategoryPill key={category.id} label={category.label} />
            ))}
          </span>
        )}
      </div>
      <div className="product-columns">
        <div className="product-column">
          <StockCard product={product} lastMovement={movements[0]} actions={actions} />
          <StockHistory
            productId={product.id}
            unit={product.defaultUnit}
            movements={movements}
            rows={rows}
            hasOlder={hasOlder}
          />
        </div>
        <div className="product-column">
          <ProductDetails product={product} />
          <RemoveCard name={product.name} outcome={removeOutcome} action={actions.remove} />
        </div>
      </div>
    </section>
  );
}

function RemoveCard({
  name,
  outcome,
  action,
}: {
  name: string;
  outcome: RemoveOutcome;
  action: () => Promise<void>;
}) {
  return (
    <div className="card product-remove">
      <h2>{t("products.remove")}</h2>
      {outcome === "archived" ? <InUseNote name={name} /> : <p>{t("sheet.deleteBody", { name })}</p>}
      <ArchiveOrDeleteButton
        name={name}
        outcome={outcome}
        archiveEffects={[
          { tone: "gone", text: t("products.archiveLeaves") },
          { tone: "kept", text: t("products.archiveRecipes") },
          { tone: "warn", text: t("products.archiveMeals") },
          { tone: "kept", text: t("products.archiveHistory") },
        ]}
        action={action}
      />
    </div>
  );
}

// "Archived" is bold, so it sits between the sentence's two parts.
function InUseNote({ name }: { name: string }) {
  const [before, after] = t("products.removeInUse", { name }).split("{archived}");
  return (
    <p>
      {before}
      <strong>{t("products.removeArchived")}</strong>
      {after}
    </p>
  );
}

function StockCard({
  product,
  lastMovement,
  actions,
}: {
  product: Product;
  lastMovement: StockMovement | undefined;
  actions: StockActionRunners;
}) {
  return (
    <div className="card stock-card">
      <div className="stock-card-summary">
        <span className="eyebrow">{t("products.stock")}</span>
        <strong className="stock-card-amount">{formatQuantity(product.stock, product.defaultUnit)}</strong>
        {lastMovement && <LastChange movement={lastMovement} />}
        {product.stockSuspect && (
          <>
            <span className="flag">{t("stock.suspect")}</span>
            <p>{t("products.stockSuspect")}</p>
          </>
        )}
      </div>
      <StockActions product={product} actions={actions} />
    </div>
  );
}

// The date comes from the browser, so it sits between the sentence's two parts.
function LastChange({ movement }: { movement: StockMovement }) {
  const [before, after] = t("products.lastChange", { type: t(`stockMovement.${movement.type}`) }).split("{date}");
  return (
    <p className="stock-card-last-change">
      {before}
      <LocalDate value={movement.createdAt} />
      {after}
    </p>
  );
}

function ProductDetails({ product }: { product: Product }) {
  const { defaultUnit, packSize, density } = product;
  return (
    <div className="card product-details">
      <h2 className="card-heading">{t("products.details")}</h2>
      <dl className="details">
        <Detail label={t("products.defaultUnit")} help={t("products.defaultUnitHelp")} value={t(`unit.${defaultUnit}`)} />
        <Detail
          label={t("products.packSize")}
          help={t("products.packSizeHelp")}
          value={packSize && formatPackSize(packSize, defaultUnit)}
        />
        <Detail
          label={t("products.densityDetail")}
          help={t("products.densityHelp")}
          value={density === null ? null : t("products.densityValue", { density })}
        />
      </dl>
    </div>
  );
}

function Detail({ label, help, value }: { label: string; help: string; value: string | null }) {
  return (
    <div>
      <dt>
        {label}
        <span>{help}</span>
      </dt>
      {value === null ? <dd className="details-unset">{t("products.notSet")}</dd> : <dd>{value}</dd>}
    </div>
  );
}

// "Show older" asks the server for more of the newest rows, instead of adding
// to the ones on screen, so a Stock Movement made meanwhile leaves no gap.
function StockHistory({
  productId,
  unit,
  movements,
  rows,
  hasOlder,
}: {
  productId: string;
  unit: DefaultUnit;
  movements: StockMovement[];
  rows: number;
  hasOlder: boolean;
}) {
  return (
    <div className="card product-history">
      <div className="card-heading">
        <h2>{t("products.history")}</h2>
        <p>{t("products.historyHint")}</p>
      </div>
      {movements.length === 0 ? (
        <p className="stock-history-empty">{t("products.historyEmpty")}</p>
      ) : (
        <>
          <ul className="stock-history">
            {movements.map((movement) => (
              <li key={movement.id} className="list-row">
                <span className={`list-row-tile list-row-tile-${movement.type}`} />
                <span className="list-row-text">
                  <span className="list-row-title">
                    {t("stockMovement.amount", {
                      type: t(`stockMovement.${movement.type}`),
                      amount: movementAmount(movement, unit),
                    })}
                  </span>
                  <span className="list-row-meta">
                    <LocalDate value={movement.createdAt} />
                    {movement.meal &&
                      ` ${t("stockMovement.mealAfterDate", { meal: formatMovementMeal(movement.meal) })}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {hasOlder && (
            <Link
              href={`/products/${productId}?rows=${rows + STOCK_HISTORY_PAGE_SIZE}`}
              className="stock-history-older"
              replace
              scroll={false}
            >
              {t("products.historyOlder")}
            </Link>
          )}
        </>
      )}
    </div>
  );
}

// A Correction sets Stock, so it reads as what Stock became, not by how much.
function movementAmount(movement: StockMovement, unit: DefaultUnit): string {
  return movement.type === "correction"
    ? t("stockMovement.correctedTo", { quantity: formatQuantity(movement.resultingQuantity, unit) })
    : formatDelta(movement.delta, unit);
}
