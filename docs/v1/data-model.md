# V1 data model (settled 2026-10-21)

Started 2026-10-20 with `/grill-with-docs`. Resume by re-running it and pointing at this file.

## Decided

- **Q1 Stock**: Stock Movements are the record; Product keeps a `stock` column and a "stock was probably wrong" flag, updated in the same transaction as each movement. Each movement stores its resulting quantity.
- **Q3 Meal status**: store `status ∈ {planned, confirmed, skipped}`. Unconfirmed is never stored: it is `planned` with a date before today. Untracked is a separate boolean. Glossary "Planned" narrowed to Meals whose day has not passed.
- **Q4 Meal Slot**: one `meal_slots` table with `content ∈ {empty, recipe, product, leftovers}`, nullable `recipe_id`, `product_id`, `portions`, `quantity`, CHECK constraints so only the matching columns are set; plus Slot Category and position.

- **Q2 Precision**: all decimals (Stock, amounts, quantities, Density) are `numeric(10,2)`; `core` uses plain JS numbers rounded to 2 decimals on write.
- **Q6 Recipe Food Categories**: store `product_food_categories` and `recipe_category_overrides(recipe_id, category_id, mode add|remove)`; final set computed in `core` on read, never stored.
- **Q7 Seeded labels**: `seed_key` (seeded rows) + `name` (user-created or renamed), CHECK at least one; display `name ?? t(seed_key)`. Rename keeps the key.
- **Q8 IDs**: UUIDs via `gen_random_uuid()`.
- **Q9 Dates**: Meal `date` + `time` without time zone; `timestamptz` for movements and `created_at`. (Which time zone decides "today": see round 2.)
- **Q10**: no "Breakfast" Role (it is a Meal Type); removed from #4.
- **Q11 Shopping List**: Products only, no free-text items. (Ticking vs Restock: see round 2.)

- **Q9b Time zone**: resolved in [#15](https://github.com/HugoBar/jeeves/issues/15). One Household Time Zone (HTZ), stored in `settings`; default from the first browser, editable.
- **Q11b Ticking**: ticking only marks an item as in the cart (untickable, no Stock change); a "Restock ticked items" action asks for quantities (pre-filled with the pack-rounded amount), performs one Restock each and removes those items. Spec, glossary and #14 updated.
- **Q11c Regenerating**: keeps manual items and items already on the list with their tick (only matters for ticked-but-not-yet-restocked items).
- **Q12 Reopen**: reopening writes opposite Stock Movements that add back exactly what the Confirmation removed (respecting clamping); Meal-caused movements link to their Meal. Glossary entry **Reopen** added; Stock Movement causes now include Reopen. Spec and #10 updated.

- **Q5 Meals, Meal Templates, Meal Series** (re-evaluated in a dedicated session, 2026-10-21):
  - A Meal Template is only a prefill shortcut. A Meal can be created from scratch (Meal Type + hour, no slots). Creating from a template copies name, Meal Type, hour and empty slots; `meals` has **no** template link.
  - A Meal owns its hour and optional `name` (card shows name ?? Meal Type); its Meal Type is fixed.
  - The one-Meal-per-Meal-Type-per-day rule is **dropped** (no unique `(date, meal_type_id)`). Projected Stock tie-break: date, priority, hour, then `created_at`.
  - Seeded Meal Types: Breakfast P2, Lunch P1 (Leftovers), Snack P3, Dinner P1 (Leftovers). "Morning Snack" etc. are names. No seeded templates.
  - New in V1: **Meal Series** (repeats on chosen weekdays, no food). Behaviour in spec "Meal Series" and [#16](https://github.com/HugoBar/jeeves/issues/16). Repeating food and starting a series from a past Meal are out of scope.
  - Tables:
    - `meal_templates(name, meal_type_id, hour)`
    - `meal_series(name?, meal_type_id, hour, weekdays smallint[] 1–7 Mon=1, generated_through date)`
    - `layout_slots(position, slot_category_id, template_id?, series_id?)`, CHECK exactly one owner. A Template's or Series' slots: Slot Category only, never food.
    - `meals(date, hour, meal_type_id, name?, status, untracked, series_id? ON DELETE SET NULL, created_at)`
    - `meal_slots` as in Q4. Created as copies of `layout_slots` (empty) when a Meal is created; the layout slots stay.
  - Repeat generation: when the planner is opened, create repeats for ticked weekdays after `generated_through` up to next Sunday, then advance it. Only moving forward is what keeps "only this one" deletions from coming back. "This and all following" delete removes later Planned repeats, then the series row.

- **Table review (T1–T8)**, 2026-10-21:
  - **T1 Pack Size**: `pack_size_name?` + `pack_size_amount?` on `products`, CHECK both or neither.
  - **T2 Density**: grams per millilitre, `numeric(10,4)`; an exception to Q2, since 2 decimals could put a 1 l conversion off by 5 g.
  - **T3 Archived**: `archived_at timestamptz?` on `products`, `recipes` and `food_categories`.
  - **T4 Portions**: whole numbers everywhere (`integer` on `recipes` and `meal_slots`); an exception to Q2. Eating half a Portion still uses one.
  - **T5 Ordering**: integer `position`, renumbered on reorder (ingredients, layout slots, meal slots).
  - **T6 Confirmation movements**: one Stock Movement per Product per Confirmation, summed over slots, with `meal_id`.
  - **T7 Shopping List quantity**: stored at generation time; `quantity?` (manual items may have none), `source` shortfall|manual, `ticked`, one row per Product.
  - **T8 Enums**: Postgres enums for units, movement type, Meal status, slot content, Role/Kind.
  - Deletes: RESTRICT by default (blocked while referenced); CASCADE from a Recipe/Meal/Template/Series to its own ingredients or slots, from a Recipe to its own `recipe_category_overrides`, and from a Product to its own `product_food_categories` links; `meals.series_id` SET NULL.

## Tables (V1)

Every table: `id uuid`, `created_at timestamptz`. `?` = nullable.

- `food_categories(seed_key?, name?, kind, archived_at?)`
- `products(name, default_unit, density?, pack_size_name?, pack_size_amount?, stock, stock_suspect, archived_at?)`
- `product_food_categories(product_id, category_id)`
- `stock_movements(product_id, type, delta, resulting_quantity, meal_id?)`
- `shopping_list_items(product_id unique, quantity?, source, ticked)`
- `recipes(name, portions, steps, prep_time_minutes, source_url?, archived_at?)`
- `ingredients(recipe_id, product_id, amount, unit, minor, position)`
- `recipe_category_overrides(recipe_id, category_id, mode)`
- `meal_types(seed_key?, name?, priority, allows_leftovers)`
- `meal_templates(name, meal_type_id, hour)`
- `meal_series(name?, meal_type_id, hour, weekdays, generated_through)`
- `layout_slots(position, slot_category_id, template_id?, series_id?)`
- `meals(date, hour, meal_type_id, name?, status, untracked, series_id?)`
- `meal_slots(meal_id, position, slot_category_id, content, recipe_id?, product_id?, portions?, quantity?)`
- `settings(household_time_zone)`: single row; IANA name, e.g. `Europe/Paris`

## Open

(none)

## After Q5

- ADRs: done. `docs/adr/0003` (Stock stored alongside movement history) and `0004` (Meal Series repeats are real Meals).
- Time zone: resolved ([#15](https://github.com/HugoBar/jeeves/issues/15)).
