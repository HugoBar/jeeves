-- Seed Meal Types (spec: Meal Types and Meal Templates). Keys must match
-- SEED_MEAL_TYPES in src/core/meal-types (checked by src/db/meal-types.db.test.ts).
-- Runs once, so removed seeds never come back.
INSERT INTO "meal_types" ("seed_key", "priority", "allows_leftovers") VALUES
	('breakfast', 2, false),
	('lunch', 1, true),
	('snack', 3, false),
	('dinner', 1, true);
