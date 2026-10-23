"use server";

import { refresh } from "next/cache";
import { parseRestockQuantity, type RestockQuantityError } from "@/core/stock";
import { getDb } from "@/db";
import { restockProduct } from "@/db/stock-movements";

// `value` refills the field after a rejected submit, which React resets.
export type RestockFormState = { error: RestockQuantityError | null; value: string };

export async function restockAction(
  productId: string,
  _state: RestockFormState,
  formData: FormData,
): Promise<RestockFormState> {
  const value = String(formData.get("quantity") ?? "");
  const parsed = parseRestockQuantity(value);
  if (!parsed.ok) return { error: parsed.error, value };
  await restockProduct(getDb(), productId, parsed.quantity);
  refresh();
  return { error: null, value: "" };
}
