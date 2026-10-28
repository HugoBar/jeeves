-- Hand-edited: the generated ALTER TYPE ... ADD VALUE leaves the new values
-- unusable until commit, so the CHECKs below fail on a database already at
-- 0014. A type created in this transaction has no such limit, so it is
-- recreated with every value instead.
ALTER TYPE "public"."meal_slot_content" RENAME TO "meal_slot_content_old";--> statement-breakpoint
CREATE TYPE "public"."meal_slot_content" AS ENUM('empty', 'recipe', 'product', 'leftovers');--> statement-breakpoint
ALTER TABLE "meal_slots" ALTER COLUMN "content" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "meal_slots" ALTER COLUMN "content" SET DATA TYPE "public"."meal_slot_content" USING "content"::text::"public"."meal_slot_content";--> statement-breakpoint
ALTER TABLE "meal_slots" ALTER COLUMN "content" SET DEFAULT 'empty';--> statement-breakpoint
DROP TYPE "public"."meal_slot_content_old";--> statement-breakpoint
ALTER TABLE "meal_slots" ADD COLUMN "recipe_id" uuid;--> statement-breakpoint
ALTER TABLE "meal_slots" ADD COLUMN "portions" integer;--> statement-breakpoint
ALTER TABLE "meal_slots" ADD COLUMN "product_id" uuid;--> statement-breakpoint
ALTER TABLE "meal_slots" ADD COLUMN "quantity" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "meal_slots" ADD CONSTRAINT "meal_slots_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_slots" ADD CONSTRAINT "meal_slots_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meal_slots_recipe_id" ON "meal_slots" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "meal_slots_product_id" ON "meal_slots" USING btree ("product_id");--> statement-breakpoint
ALTER TABLE "meal_slots" ADD CONSTRAINT "meal_slots_recipe_columns" CHECK (("meal_slots"."recipe_id" is not null) = ("meal_slots"."content" = 'recipe') and ("meal_slots"."portions" is not null) = ("meal_slots"."content" = 'recipe'));--> statement-breakpoint
ALTER TABLE "meal_slots" ADD CONSTRAINT "meal_slots_product_columns" CHECK (("meal_slots"."product_id" is not null) = ("meal_slots"."content" = 'product') and ("meal_slots"."quantity" is not null) = ("meal_slots"."content" = 'product'));--> statement-breakpoint
ALTER TABLE "meal_slots" ADD CONSTRAINT "meal_slots_portions_above_zero" CHECK ("meal_slots"."portions" > 0);--> statement-breakpoint
ALTER TABLE "meal_slots" ADD CONSTRAINT "meal_slots_quantity_above_zero" CHECK ("meal_slots"."quantity" > 0);