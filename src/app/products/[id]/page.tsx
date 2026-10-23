import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { getProduct } from "@/db/products";
import { formatQuantity, t } from "@/strings";
import { isUuid } from "../../uuid";

// A Product: its Stock, and a link to edit it.
export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const product = await getProduct(getDb(), id);
  if (!product) notFound();

  return (
    <section>
      <h1>{product.name}</h1>
      <p>
        <Link href={`/products/${product.id}/edit`}>{t("products.edit")}</Link>
      </p>
      <p>{t("products.stock", { quantity: formatQuantity(product.stock, product.defaultUnit) })}</p>
    </section>
  );
}
