// Drizzle table definitions. Tables are added by the tickets that need them;
// the full V1 list is in docs/v1/data-model.md.
import { sql } from "drizzle-orm";
import type { CategorySeedKey } from "@/core/food-categories";
import { AMOUNT_COLUMN, DENSITY_COLUMN } from "@/core/amounts";
import { STOCK_MOVEMENT_TYPES } from "@/core/stock";
import { DEFAULT_UNITS } from "@/core/units";
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const foodCategoryKind = pgEnum("food_category_kind", ["role", "kind"]);

export const defaultUnit = pgEnum("default_unit", DEFAULT_UNITS);

const amount = (name: string) => numeric(name, { ...AMOUNT_COLUMN, mode: "number" });

// `stock` and `stock_suspect` change only together with a Stock Movement
// (ADR 0003). Names are unique, ignoring case, among non-Archived Products, so
// a removed Product's name can be reused.
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    name: text("name").notNull(),
    defaultUnit: defaultUnit("default_unit").notNull(),
    density: numeric("density", { ...DENSITY_COLUMN, mode: "number" }),
    packSizeName: text("pack_size_name"),
    packSizeAmount: amount("pack_size_amount"),
    stock: amount("stock").notNull().default(0),
    stockSuspect: boolean("stock_suspect").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "products_pack_size_both_or_neither",
      sql`(${table.packSizeName} is null) = (${table.packSizeAmount} is null)`,
    ),
    uniqueIndex("products_name_unique")
      .on(sql`lower(${table.name})`)
      .where(sql`${table.archivedAt} is null`),
  ],
);

// Tables that reference a category must use ON DELETE RESTRICT (data-model
// "Deletes"), never CASCADE: removing a referenced category relies on that
// error to Archive it instead.
export const foodCategories = pgTable(
  "food_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    seedKey: text("seed_key").$type<CategorySeedKey>().unique(),
    name: text("name"),
    kind: foodCategoryKind("kind").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    check("food_categories_seed_key_or_name", sql`${table.seedKey} is not null or ${table.name} is not null`),
  ],
);

// A Product's links go with it when it is hard deleted; a category in use
// cannot be deleted, so removing it Archives it and the link is kept.
export const productFoodCategories = pgTable(
  "product_food_categories",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => foodCategories.id, { onDelete: "restrict" }),
  },
  (table) => [primaryKey({ columns: [table.productId, table.categoryId] })],
);

export const stockMovementType = pgEnum("stock_movement_type", STOCK_MOVEMENT_TYPES);

// Every change to a Product's Stock, the true record of it (ADR 0003). A
// Product with movements can never be hard deleted, only Archived.
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    type: stockMovementType("type").notNull(),
    delta: amount("delta").notNull(),
    resultingQuantity: amount("resulting_quantity").notNull(),
  },
  (table) => [index("stock_movements_product_id_created_at").on(table.productId, table.createdAt)],
);

// Portions are whole numbers (data-model T4), and so is prep time, in
// minutes. Ingredients and Food Category overrides are added by their own
// tickets.
export const recipes = pgTable(
  "recipes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    name: text("name").notNull(),
    portions: integer("portions").notNull(),
    // Markdown.
    steps: text("steps").notNull(),
    prepTimeMinutes: integer("prep_time_minutes").notNull(),
    sourceUrl: text("source_url"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    check("recipes_portions_above_zero", sql`${table.portions} > 0`),
    check("recipes_prep_time_above_zero", sql`${table.prepTimeMinutes} > 0`),
  ],
);
