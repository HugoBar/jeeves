CREATE TABLE "meal_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seed_key" text,
	"name" text,
	"priority" integer NOT NULL,
	"allows_leftovers" boolean DEFAULT false NOT NULL,
	CONSTRAINT "meal_types_seed_key_unique" UNIQUE("seed_key"),
	CONSTRAINT "meal_types_seed_key_or_name" CHECK ("meal_types"."seed_key" is not null or "meal_types"."name" is not null),
	CONSTRAINT "meal_types_priority_above_zero" CHECK ("meal_types"."priority" > 0)
);
