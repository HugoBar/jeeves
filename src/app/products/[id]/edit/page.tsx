import { notFound } from "next/navigation";
import { toProductFieldsInput } from "@/core/products";
import { getDb } from "@/db";
import { getProduct } from "@/db/products";
import { t } from "@/strings";
import { isUuid } from "../../../uuid";
import { editProductAction } from "../../actions";
import { loadCategoryOptions } from "../../category-options";
import { ProductForm } from "../../product-form";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const db = getDb();
  const product = await getProduct(db, id);
  if (!product) notFound();

  return (
    <section>
      <h1>{t("products.editTitle", { name: product.name })}</h1>
      <ProductForm
        action={editProductAction.bind(null, product.id)}
        initialValues={toProductFieldsInput(product)}
        categories={await loadCategoryOptions(db)}
        submitLabel={t("products.save")}
        fixedUnit={product.defaultUnit}
        cancelHref={`/products/${product.id}`}
      />
    </section>
  );
}
