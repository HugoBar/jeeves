CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"portions" integer NOT NULL,
	"steps" text NOT NULL,
	"prep_time_minutes" integer NOT NULL,
	"source_url" text,
	"archived_at" timestamp with time zone,
	CONSTRAINT "recipes_portions_above_zero" CHECK ("recipes"."portions" > 0),
	CONSTRAINT "recipes_prep_time_above_zero" CHECK ("recipes"."prep_time_minutes" > 0)
);
