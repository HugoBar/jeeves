import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { getProduct } from "@/db/products";
import { listStockMovements } from "@/db/stock-movements";
import { formatDelta, formatQuantity, t } from "@/strings";
import { LocalDateTime } from "../../local-date-time";
import { restockAction } from "../restock-actions";
import { RestockForm } from "../restock-form";
import { isUuid } from "../../uuid";

// A Product: its Stock, Restock, and its Stock Movement history.
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
        <Link href={`/products/${product.id}/edit`}>{t("products.edit")}</Link>
      </p>
      <p>{t("products.stock", { quantity: formatQuantity(product.stock, product.defaultUnit) })}</p>
      <RestockForm action={restockAction.bind(null, product.id)} unit={product.defaultUnit} />
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
