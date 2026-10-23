CREATE TYPE "public"."default_unit" AS ENUM('g', 'ml', 'pc');--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"default_unit" "default_unit" NOT NULL,
	"density" numeric(10, 4),
	"pack_size_name" text,
	"pack_size_amount" numeric(10, 2),
	"stock" numeric(10, 2) DEFAULT 0 NOT NULL,
	"stock_suspect" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "products_pack_size_both_or_neither" CHECK (("products"."pack_size_name" is null) = ("products"."pack_size_amount" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "products_name_unique" ON "products" USING btree (lower("name")) WHERE "products"."archived_at" is null;