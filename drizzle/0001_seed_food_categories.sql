-- Seed Food Categories (spec: Food Categories). Keys must match SEED_CATEGORIES
-- in src/core/food-categories (checked by src/db/food-categories.db.test.ts).
-- Runs once, so removed seeds never come back.
INSERT INTO "food_categories" ("seed_key", "kind") VALUES
	('red_meat', 'kind'),
	('white_meat', 'kind'),
	('fish', 'kind'),
	('seafood', 'kind'),
	('eggs', 'kind'),
	('dairy', 'kind'),
	('legumes', 'kind'),
	('grains', 'kind'),
	('pasta', 'kind'),
	('vegetables', 'kind'),
	('fruit', 'kind'),
	('dried_fruit_nuts', 'kind'),
	('starter', 'role'),
	('soup', 'role'),
	('salad', 'role'),
	('main_dish', 'role'),
	('side_dish', 'role'),
	('dessert', 'role'),
	('snack', 'role'),
	('drink', 'role');
