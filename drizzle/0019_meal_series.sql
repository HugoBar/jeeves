CREATE TABLE "meal_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text,
	"meal_type_id" uuid NOT NULL,
	"hour" time(0) NOT NULL,
	"untracked" boolean DEFAULT false NOT NULL,
	"weekdays" smallint[] NOT NULL,
	"generated_through" date NOT NULL,
	CONSTRAINT "meal_series_weekdays" CHECK (cardinality("meal_series"."weekdays") > 0 and "meal_series"."weekdays" <@ array[1,2,3,4,5,6,7]::smallint[])
);
--> statement-breakpoint
ALTER TABLE "layout_slots" ALTER COLUMN "template_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "layout_slots" ADD COLUMN "series_id" uuid;--> statement-breakpoint
ALTER TABLE "meal_slots" ADD COLUMN "layout_slot_id" uuid;--> statement-breakpoint
ALTER TABLE "meals" ADD COLUMN "series_id" uuid;--> statement-breakpoint
ALTER TABLE "meal_series" ADD CONSTRAINT "meal_series_meal_type_id_meal_types_id_fk" FOREIGN KEY ("meal_type_id") REFERENCES "public"."meal_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meal_series_meal_type_id" ON "meal_series" USING btree ("meal_type_id");--> statement-breakpoint
ALTER TABLE "layout_slots" ADD CONSTRAINT "layout_slots_series_id_meal_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."meal_series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_slots" ADD CONSTRAINT "meal_slots_layout_slot_id_layout_slots_id_fk" FOREIGN KEY ("layout_slot_id") REFERENCES "public"."layout_slots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_series_id_meal_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."meal_series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "layout_slots_series_id_position" ON "layout_slots" USING btree ("series_id","position");--> statement-breakpoint
CREATE INDEX "meal_slots_layout_slot_id" ON "meal_slots" USING btree ("layout_slot_id");--> statement-breakpoint
CREATE INDEX "meals_series_id" ON "meals" USING btree ("series_id");--> statement-breakpoint
ALTER TABLE "layout_slots" ADD CONSTRAINT "layout_slots_one_owner" CHECK (("layout_slots"."template_id" is null) <> ("layout_slots"."series_id" is null));