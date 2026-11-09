CREATE TYPE "public"."shopping_list_source" AS ENUM('shortfall', 'manual');--> statement-breakpoint
CREATE TABLE "shopping_list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(10, 2),
	"source" "shopping_list_source" NOT NULL,
	"ticked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "shopping_list_items_quantity_above_zero" CHECK ("shopping_list_items"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shopping_list_items_unticked_product_id" ON "shopping_list_items" USING btree ("product_id") WHERE not "shopping_list_items"."ticked";--> statement-breakpoint
CREATE INDEX "shopping_list_items_product_id" ON "shopping_list_items" USING btree ("product_id");