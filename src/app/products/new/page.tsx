import { connection } from "next/server";
import { getDb } from "@/db";
import { t } from "@/strings";
import { loadCategoryOptions } from "../../categories/category-options";
import { BackLink } from "../../list-row";
import { createProductAction } from "../actions";
import { ProductForm } from "../product-form";

export default async function NewProductPage() {
  // Read from the database on every request, never at build time.
  await connection();

  return (
    <section className="page-form">
      <BackLink href="/products">{t("stock.title")}</BackLink>
      <div className="page-toolbar">
        <h1>{t("products.newTitle")}</h1>
      </div>
      <ProductForm
        action={createProductAction}
        initialValues={{ name: "", density: "", packSizeName: "", packSizeAmount: "", categoryIds: [] }}
        categories={await loadCategoryOptions(getDb())}
        submitLabel={t("products.create")}
      />
    </section>
  );
}
