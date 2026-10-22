CREATE TYPE "public"."food_category_kind" AS ENUM('role', 'kind');--> statement-breakpoint
CREATE TABLE "food_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seed_key" text,
	"name" text,
	"kind" "food_category_kind" NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "food_categories_seed_key_unique" UNIQUE("seed_key"),
	CONSTRAINT "food_categories_seed_key_or_name" CHECK ("food_categories"."seed_key" is not null or "food_categories"."name" is not null)
);
