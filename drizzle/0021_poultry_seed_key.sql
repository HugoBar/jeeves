-- The seeded Kind White Meat is now Poultry (#203). Renames its key so it
-- matches SEED_CATEGORIES in src/core/food-categories; a name the user gave
-- it is kept.
UPDATE "food_categories" SET "seed_key" = 'poultry' WHERE "seed_key" = 'white_meat';
