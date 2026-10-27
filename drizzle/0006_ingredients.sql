CREATE TYPE "public"."recipe_unit" AS ENUM('g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'pc');--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"unit" "recipe_unit" NOT NULL,
	"minor" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "ingredients_amount_above_zero" CHECK ("ingredients"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ingredients_recipe_id_position" ON "ingredients" USING btree ("recipe_id","position");--> statement-breakpoint
CREATE INDEX "ingredients_product_id" ON "ingredients" USING btree ("product_id");