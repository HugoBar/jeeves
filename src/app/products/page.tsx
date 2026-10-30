import { connection } from "next/server";
import { getDb } from "@/db";
import { listActiveProducts } from "@/db/products";
import { loadCategoryOptions } from "../categories/category-options";
import { StockList } from "./stock-list";

// The Stock list.
export default async function StockPage() {
  // Read from the database on every request, never at build time.
  await connection();
  const db = getDb();
  const [products, categories] = await Promise.all([listActiveProducts(db), loadCategoryOptions(db)]);

  return <StockList products={products} categories={categories} />;
}
