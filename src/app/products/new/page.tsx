import { t } from "@/strings";
import { createProductAction } from "../actions";
import { ProductForm } from "../product-form";

export default function NewProductPage() {
  return (
    <section>
      <h1>{t("products.newTitle")}</h1>
      <ProductForm
        action={createProductAction}
        initialValues={{ name: "", density: "", packSizeName: "", packSizeAmount: "" }}
        submitLabel={t("products.create")}
      />
    </section>
  );
}
