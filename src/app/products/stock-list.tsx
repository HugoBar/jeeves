import Link from "next/link";
import { sortByName } from "@/core/names";
import type { Product } from "@/db/products";
import { formatProductCount, formatQuantity, t } from "@/strings";
import type { CategoryOption } from "../categories/category-options";
import { FoodCategoryPill } from "../food-category-pill";
import { LinkRow } from "../list-row";

type StockListProduct = Pick<Product, "id" | "name" | "stock" | "defaultUnit" | "stockSuspect" | "categoryIds">;

// The Stock list. Pills follow the order of `categories`, which also holds
// their labels.
export function StockList({ products, categories }: { products: StockListProduct[]; categories: CategoryOption[] }) {
  return (
    <section className="page-wide">
      <div className="page-toolbar">
        <h1>
          {t("stock.title")}
          {products.length > 0 && <span className="page-count">{formatProductCount(products.length)}</span>}
        </h1>
        <Link href="/products/new" className="button button-primary button-add">
          {t("products.add")}
        </Link>
      </div>
      {products.length === 0 ? (
        <div className="empty-state">
          <strong>{t("stock.empty")}</strong>
          <p>{t("stock.emptyHint")}</p>
          <Link href="/products/new" className="button button-primary">
            {t("products.add")}
          </Link>
        </div>
      ) : (
        <ul className="list stock-list">
          <li className="stock-list-head" aria-hidden="true">
            <span>{t("stock.columnProduct")}</span>
            <span>{t("stock.columnCategories")}</span>
            <span>{t("stock.columnStock")}</span>
          </li>
          {sortByName(products).map((product) => (
            <li key={product.id}>
              <StockRow
                product={product}
                categories={categories.filter((category) => product.categoryIds.includes(category.id))}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StockRow({ product, categories }: { product: StockListProduct; categories: CategoryOption[] }) {
  return (
    <LinkRow href={`/products/${product.id}`}>
      <span className="list-row-text">
        <span className="list-row-title">{product.name}</span>
        {(categories.length > 0 || product.stockSuspect) && (
          <span className="pills">
            {categories.map((category) => (
              <FoodCategoryPill key={category.id} label={category.label} />
            ))}
            {product.stockSuspect && <span className="flag">{t("stock.suspect")}</span>}
          </span>
        )}
      </span>
      <span className={product.stock === 0 ? "list-row-value list-row-value-empty" : "list-row-value"}>
        {formatQuantity(product.stock, product.defaultUnit)}
      </span>
    </LinkRow>
  );
}
