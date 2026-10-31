import { notFound } from "next/navigation";
import { toProductFieldsInput } from "@/core/products";
import { isUuid } from "@/core/uuid";
import { getDb } from "@/db";
import { getProduct } from "@/db/products";
import { t } from "@/strings";
import { loadCategoryOptions } from "../../../categories/category-options";
import { BackLink } from "../../../list-row";
import { editProductAction } from "../../actions";
import { ProductForm } from "../../product-form";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const db = getDb();
  const product = await getProduct(db, id);
  if (!product) notFound();

  return (
    <section className="page-form">
      <BackLink href={`/products/${product.id}`}>{product.name}</BackLink>
      <div className="page-toolbar">
        <h1>{t("products.editTitle", { name: product.name })}</h1>
      </div>
      <ProductForm
        action={editProductAction.bind(null, product.id)}
        initialValues={toProductFieldsInput(product)}
        categories={await loadCategoryOptions(db)}
        submitLabel={t("products.save")}
        editing={{ name: product.name, defaultUnit: product.defaultUnit }}
        cancelHref={`/products/${product.id}`}
      />
    </section>
  );
}
