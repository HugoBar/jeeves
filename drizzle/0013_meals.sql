CREATE TYPE "public"."meal_status" AS ENUM('planned');--> statement-breakpoint
CREATE TABLE "meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"date" date NOT NULL,
	"hour" time(0) NOT NULL,
	"meal_type_id" uuid NOT NULL,
	"name" text,
	"status" "meal_status" DEFAULT 'planned' NOT NULL,
	"untracked" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_meal_type_id_meal_types_id_fk" FOREIGN KEY ("meal_type_id") REFERENCES "public"."meal_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meals_date" ON "meals" USING btree ("date");--> statement-breakpoint
CREATE INDEX "meals_meal_type_id" ON "meals" USING btree ("meal_type_id");