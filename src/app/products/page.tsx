import Link from "next/link";
import { connection } from "next/server";
import { sortByName } from "@/core/names";
import { getDb } from "@/db";
import { listActiveProducts } from "@/db/products";
import { formatQuantity, t } from "@/strings";

// The Stock list.
export default async function StockPage() {
  // Read from the database on every request, never at build time.
  await connection();
  const products = sortByName(await listActiveProducts(getDb()));

  return (
    <section>
      <h1>{t("stock.title")}</h1>
      <p>
        <Link href="/products/new">{t("products.add")}</Link>
      </p>
      {products.length === 0 ? (
        <p>{t("stock.empty")}</p>
      ) : (
        <ul className="stock-list">
          {products.map((product) => (
            <li key={product.id}>
              <Link href={`/products/${product.id}`}>
                <span>{product.name}</span>
                <span>
                  {product.stockSuspect && <span className="stock-suspect">{t("stock.suspect")} </span>}
                  {formatQuantity(product.stock, product.defaultUnit)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
