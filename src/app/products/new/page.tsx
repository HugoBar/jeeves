import { connection } from "next/server";
import { getDb } from "@/db";
import { t } from "@/strings";
import { createProductAction } from "../actions";
import { loadCategoryOptions } from "../category-options";
import { ProductForm } from "../product-form";

export default async function NewProductPage() {
  // Read from the database on every request, never at build time.
  await connection();

  return (
    <section>
      <h1>{t("products.newTitle")}</h1>
      <ProductForm
        action={createProductAction}
        initialValues={{ name: "", density: "", packSizeName: "", packSizeAmount: "", categoryIds: [] }}
        categories={await loadCategoryOptions(getDb())}
        submitLabel={t("products.create")}
      />
    </section>
  );
}
