CREATE TYPE "public"."meal_slot_content" AS ENUM('empty');--> statement-breakpoint
CREATE TABLE "meal_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"meal_id" uuid NOT NULL,
	"slot_category_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"content" "meal_slot_content" DEFAULT 'empty' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meal_slots" ADD CONSTRAINT "meal_slots_meal_id_meals_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_slots" ADD CONSTRAINT "meal_slots_slot_category_id_food_categories_id_fk" FOREIGN KEY ("slot_category_id") REFERENCES "public"."food_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meal_slots_meal_id_position" ON "meal_slots" USING btree ("meal_id","position");--> statement-breakpoint
CREATE INDEX "meal_slots_slot_category_id" ON "meal_slots" USING btree ("slot_category_id");