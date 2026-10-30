import Link from "next/link";
import { connection } from "next/server";
import { sortByName } from "@/core/names";
import { getDb } from "@/db";
import { listActiveProducts } from "@/db/products";
import { formatQuantity, t } from "@/strings";
import { LinkRow } from "../list-row";

// The Stock list.
export default async function StockPage() {
  // Read from the database on every request, never at build time.
  await connection();
  const products = sortByName(await listActiveProducts(getDb()));

  return (
    <section>
      <h1>{t("stock.title")}</h1>
      <p>
        <Link href="/products/new" className="button button-primary">
          {t("products.add")}
        </Link>
      </p>
      {products.length === 0 ? (
        <p>{t("stock.empty")}</p>
      ) : (
        <ul className="list">
          {products.map((product) => (
            <li key={product.id}>
              <LinkRow href={`/products/${product.id}`}>
                <span className="list-row-text">
                  <span className="list-row-title">{product.name}</span>
                  {product.stockSuspect && <span className="flag">{t("stock.suspect")}</span>}
                </span>
                <span className="list-row-value">{formatQuantity(product.stock, product.defaultUnit)}</span>
              </LinkRow>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
