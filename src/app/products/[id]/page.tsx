import { notFound } from "next/navigation";
import { parseHistoryRows } from "@/core/stock";
import { isUuid } from "@/core/uuid";
import { getDb } from "@/db";
import { getProduct, removeProductOutcome } from "@/db/products";
import { listStockMovements } from "@/db/stock-movements";
import { loadCategoryOptions } from "../../categories/category-options";
import { removeProductAction } from "../actions";
import { parseProductOrigin } from "../origin";
import { ProductView } from "../product-view";
import { correctAction, discardAction, restockAction } from "../stock-actions";

// A Product's page. One row past `rows` tells whether there are older ones.
// `from` is the page it was opened from, which its back link returns to.
export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ rows?: string | string[]; from?: string | string[] }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const query = await searchParams;
  const rows = parseHistoryRows(query.rows);
  const from = parseProductOrigin(query.from);
  const db = getDb();
  const product = await getProduct(db, id);
  if (!product) notFound();
  const [movements, categories, removeOutcome] = await Promise.all([
    listStockMovements(db, id, rows + 1),
    loadCategoryOptions(db),
    removeProductOutcome(db, id),
  ]);

  return (
    <ProductView
      product={product}
      categories={categories}
      movements={movements.slice(0, rows)}
      rows={rows}
      hasOlder={movements.length > rows}
      removeOutcome={removeOutcome}
      from={from}
      actions={{
        restock: restockAction.bind(null, id),
        discard: discardAction.bind(null, id),
        correction: correctAction.bind(null, id),
        remove: removeProductAction.bind(null, id, removeOutcome, from),
      }}
    />
  );
}
