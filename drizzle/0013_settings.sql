CREATE TABLE "settings" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"household_time_zone" text NOT NULL,
	CONSTRAINT "settings_single_row" CHECK ("settings"."id")
);
