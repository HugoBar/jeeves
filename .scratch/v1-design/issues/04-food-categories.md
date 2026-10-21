# Food Categories (Roles and Kinds)

Status: ready-for-agent
Blocked by: 02

See `../spec.md` (Food Categories).

## Acceptance
- CRUD for Food Categories, each either a Role or a Kind.
- Seeded on first run. Kinds: Red Meat, White Meat, Fish, Seafood, Eggs, Dairy, Legumes, Grains, Pasta, Vegetables, Fruit, Dried Fruit & Nuts. Roles: Starter, Soup, Salad, Main Dish, Side Dish, Dessert, Snack, Drink.
- Seeded categories are stored with a stable key (e.g. `red_meat`), not a display name; the UI shows the key's string from the centralised UI strings file. User-created categories store the name the user typed. Renaming a seeded category stores that name, which then overrides the key's string.
- Deleting a category in use is blocked with a message saying where it is used.
