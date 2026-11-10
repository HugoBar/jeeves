import { notFound } from "next/navigation";
import { toProductFieldsInput } from "@/core/products";
import { isUuid } from "@/core/uuid";
import { getDb } from "@/db";
import { getProduct } from "@/db/products";
import { t } from "@/strings";
import { loadCategoryOptions } from "../../../categories/category-options";
import { BackLink } from "../../../list-row";
import { editProductAction } from "../../actions";
import { parseProductOrigin, productHref } from "../../origin";
import { ProductForm } from "../../product-form";

// `from` is the page the Product page was opened from: Save, Cancel and the
// back link keep it, so the Product page's back link still returns there.
export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const { id } = await params;
  const from = parseProductOrigin((await searchParams).from);
  if (!isUuid(id)) notFound();
  const db = getDb();
  const product = await getProduct(db, id);
  if (!product) notFound();

  return (
    <section className="page-form">
      <BackLink href={productHref(product.id, from)}>{product.name}</BackLink>
      <div className="page-toolbar">
        <h1>{t("products.editTitle", { name: product.name })}</h1>
      </div>
      <ProductForm
        action={editProductAction.bind(null, product.id, from)}
        initialValues={toProductFieldsInput(product)}
        categories={await loadCategoryOptions(db)}
        submitLabel={t("products.save")}
        editing={{ name: product.name, defaultUnit: product.defaultUnit }}
        cancelHref={productHref(product.id, from)}
      />
    </section>
  );
}
