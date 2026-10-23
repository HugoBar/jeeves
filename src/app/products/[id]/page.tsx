import { notFound } from "next/navigation";
import { toProductFieldsInput } from "@/core/products";
import { getDb } from "@/db";
import { getProduct } from "@/db/products";
import { t } from "@/strings";
import { editProductAction } from "../actions";
import { ProductForm } from "../product-form";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Postgres rejects a malformed uuid outright; that is a missing page, not an error.
  if (!UUID.test(id)) notFound();
  const product = await getProduct(getDb(), id);
  if (!product) notFound();

  return (
    <section>
      <h1>{t("products.editTitle", { name: product.name })}</h1>
      <ProductForm
        action={editProductAction.bind(null, product.id)}
        initialValues={toProductFieldsInput(product)}
        submitLabel={t("products.save")}
        fixedUnit={product.defaultUnit}
      />
    </section>
  );
}
