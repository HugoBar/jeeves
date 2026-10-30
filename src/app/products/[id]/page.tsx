import Link from "next/link";
import { notFound } from "next/navigation";
import { isUuid } from "@/core/uuid";
import { getDb } from "@/db";
import { getProduct } from "@/db/products";
import { listStockMovements } from "@/db/stock-movements";
import { formatDelta, formatQuantity, t } from "@/strings";
import { LocalDateTime } from "../../local-date-time";
import { RemoveButton } from "../../remove-button";
import { removeProductAction } from "../actions";
import { correctAction, discardAction, restockAction } from "../stock-actions";
import { StockForm } from "../stock-form";

// A Product: its Stock, the Restock, Discard and Correction forms, and its
// Stock Movement history.
export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const db = getDb();
  const product = await getProduct(db, id);
  if (!product) notFound();
  const movements = await listStockMovements(db, id);

  return (
    <section>
      <h1>{product.name}</h1>
      <p>
        <Link href={`/products/${product.id}/edit`} className="button">
          {t("products.edit")}
        </Link>
      </p>
      <RemoveButton
        action={removeProductAction.bind(null, product.id)}
        label={t("products.remove")}
        confirmMessage={t("products.removeConfirm", { name: product.name })}
      />
      <p>{t("products.stock", { quantity: formatQuantity(product.stock, product.defaultUnit) })}</p>
      {product.stockSuspect && <p className="stock-suspect">{t("products.stockSuspect")}</p>}
      <StockForm kind="restock" action={restockAction.bind(null, product.id)} unit={product.defaultUnit} />
      <StockForm kind="discard" action={discardAction.bind(null, product.id)} unit={product.defaultUnit} />
      <StockForm kind="correction" action={correctAction.bind(null, product.id)} unit={product.defaultUnit} />
      <h2>{t("products.history")}</h2>
      {movements.length === 0 ? (
        <p>{t("products.historyEmpty")}</p>
      ) : (
        <ul className="movement-list">
          {movements.map((movement) => (
            <li key={movement.id} className="stock-movement">
              <span>
                {t(`stockMovement.${movement.type}`)} <LocalDateTime value={movement.createdAt} />
              </span>
              <span>
                {t("stockMovement.change", {
                  delta: formatDelta(movement.delta, product.defaultUnit),
                  quantity: formatQuantity(movement.resultingQuantity, product.defaultUnit),
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
