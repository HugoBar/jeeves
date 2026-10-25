"use client";

import { t } from "@/strings";
import { removeProductAction } from "./actions";

export function RemoveProductButton({ id, name }: { id: string; name: string }) {
  return (
    <form
      action={removeProductAction.bind(null, id)}
      onSubmit={(event) => {
        if (!confirm(t("products.removeConfirm", { name }))) event.preventDefault();
      }}
    >
      <button type="submit">{t("products.remove")}</button>
    </form>
  );
}
