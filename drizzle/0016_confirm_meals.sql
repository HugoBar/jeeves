ALTER TYPE "public"."meal_status" ADD VALUE 'confirmed';--> statement-breakpoint
ALTER TYPE "public"."meal_status" ADD VALUE 'skipped';--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "meal_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_meal_id_meals_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_movements_meal_id" ON "stock_movements" USING btree ("meal_id");