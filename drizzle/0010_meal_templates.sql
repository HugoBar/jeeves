CREATE TABLE "meal_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"hour" time(0) NOT NULL,
	"meal_type_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meal_templates" ADD CONSTRAINT "meal_templates_meal_type_id_meal_types_id_fk" FOREIGN KEY ("meal_type_id") REFERENCES "public"."meal_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meal_templates_meal_type_id" ON "meal_templates" USING btree ("meal_type_id");