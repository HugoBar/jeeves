// Drizzle table definitions. Tables are added by the tickets that need them;
// the full V1 list is in docs/v1/data-model.md.
import { sql } from "drizzle-orm";
import type { CategorySeedKey } from "@/core/food-categories";
import { check, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const foodCategoryKind = pgEnum("food_category_kind", ["role", "kind"]);

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
