CREATE TABLE "layout_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"template_id" uuid NOT NULL,
	"slot_category_id" uuid NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "layout_slots" ADD CONSTRAINT "layout_slots_template_id_meal_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."meal_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "layout_slots" ADD CONSTRAINT "layout_slots_slot_category_id_food_categories_id_fk" FOREIGN KEY ("slot_category_id") REFERENCES "public"."food_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "layout_slots_template_id_position" ON "layout_slots" USING btree ("template_id","position");--> statement-breakpoint
CREATE INDEX "layout_slots_slot_category_id" ON "layout_slots" USING btree ("slot_category_id");