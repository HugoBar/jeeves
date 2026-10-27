CREATE TYPE "public"."category_override_mode" AS ENUM('add', 'remove');--> statement-breakpoint
CREATE TABLE "recipe_category_overrides" (
	"recipe_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"mode" "category_override_mode" NOT NULL,
	CONSTRAINT "recipe_category_overrides_recipe_id_category_id_pk" PRIMARY KEY("recipe_id","category_id")
);
--> statement-breakpoint
ALTER TABLE "recipe_category_overrides" ADD CONSTRAINT "recipe_category_overrides_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_category_overrides" ADD CONSTRAINT "recipe_category_overrides_category_id_food_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."food_categories"("id") ON DELETE restrict ON UPDATE no action;