import { notFound } from "next/navigation";
import { isUuid } from "@/core/uuid";
import { getDb } from "@/db";
import { getProduct } from "@/db/products";
import { listStockMovements } from "@/db/stock-movements";
import { loadCategoryOptions } from "../../categories/category-options";
import { removeProductAction } from "../actions";
import { ProductView } from "../product-view";
import { correctAction, discardAction, restockAction } from "../stock-actions";

// A Product's page.
export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const db = getDb();
  const product = await getProduct(db, id);
  if (!product) notFound();
  const [movements, categories] = await Promise.all([listStockMovements(db, id), loadCategoryOptions(db)]);

  return (
    <ProductView
      product={product}
      categories={categories}
      movements={movements}
      actions={{
        restock: restockAction.bind(null, id),
        discard: discardAction.bind(null, id),
        correction: correctAction.bind(null, id),
        remove: removeProductAction.bind(null, id),
      }}
    />
  );
}
