CREATE TYPE "public"."stock_movement_type" AS ENUM('restock', 'discard', 'correction', 'confirmation', 'reopen');--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"product_id" uuid NOT NULL,
	"type" "stock_movement_type" NOT NULL,
	"delta" numeric(10, 2) NOT NULL,
	"resulting_quantity" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_movements_product_id_created_at" ON "stock_movements" USING btree ("product_id","created_at");