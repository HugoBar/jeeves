# Jeeves V1

Domain language: `GLOSSARY.md`. Architecture decisions: `docs/adr/`. Every capitalised term below is a glossary term.

## Problem

I want one place that knows what food is in my Pantry, what I can cook from it, and what I plan to eat — so that eating a meal keeps Stock accurate, I get varied meal Suggestions, and I can build a Shopping List from what my plan is short of.

## Scope

### Pantry
- Products have a Default Unit (g, ml, count), optional Density, optional Pack Size, and Food Categories. "Remove" Archives; hard delete only when unreferenced.
- Stock changes only through Stock Movements: Restock, Discard, Correction, Confirmation. Every movement is recorded with its reason.
- Stock is a decimal and never goes below 0. A deduction that would go negative clamps to 0 and flags the Product as "stock was probably wrong".

### Units
- Recipe units: g, kg, ml, l, tsp (5 ml), tbsp (15 ml), cup (250 ml), pc. Decimals allowed.
- Mass ↔ volume converts via the Product's Density. Count never converts to or from mass/volume.
- A Recipe can't be saved with an Ingredient whose unit can't convert to its Product's Default Unit; the error names the missing Product field (Density).
- Pack Size appears only on the Shopping List: round up to whole packs, always show the real amount ("2 bags (1,300 g needed)").

### Recipes
- Name, Portions (how many it is written for), Ingredients (Product + amount + unit + Minor flag), steps (markdown), prep time, optional source URL. "Remove" Archives.
- Food Categories = union of non-Minor Ingredients' Products' categories, plus per-Recipe "add" and "remove" overrides stored separately so they survive Ingredient edits.

### Food Categories
- Each is a **Role** (Main Dish, Side Dish…) or a **Kind** (Fish, Fruit…). User-editable.
- Seed Kinds: Red Meat, White Meat, Fish, Seafood, Eggs, Dairy, Legumes, Grains, Pasta, Vegetables, Fruit, Dried Fruit & Nuts. Seed Roles: Starter, Soup, Salad, Main Dish, Side Dish, Dessert, Snack, Drink.
- Seeds are stored by stable key and displayed via the UI strings file (see Platform).

### Meal Types and Meal Templates
- Meal Types (editable) carry Meal Priority and "allows Leftovers". Seeds: Breakfast (P2), Lunch (P1, Leftovers), Snack (P3), Dinner (P1, Leftovers). Names such as "Morning Snack" are Meal or Meal Template names, not Meal Types.
- Meal Templates: name, hour, one Meal Type, optional ordered Meal Slots each with a Slot Category. Several per Meal Type. A template is only a shortcut: creating a Meal from it copies its name, Meal Type, hour and empty slots, and the Meal keeps no link to it. Editing or deleting a template never changes existing Meals. No templates are seeded.

### Planning
- Planner covers the current week and next week (Monday–Sunday), both always editable.
- The two weeks must look different: header ("THIS WEEK · 20–26 Oct" / "NEXT WEEK · 27 Oct–2 Nov"), a distinct accent colour for next week, and an "Editing: next Tuesday" label on Meal forms. Today is highlighted.
- A Meal is created on a date either from scratch (pick a Meal Type and an hour; no slots) or from a Meal Template. A day can have several Meals of the same Meal Type. Meals are sorted by hour.
- A Meal has its own hour and optional name, both editable; its Meal Type never changes. Its card shows the name if set, else the Meal Type.
- Picking for a slot shows only Recipes/Products carrying its Slot Category. A Meal Slot holds a Recipe (Portions, default = Recipe's Portions), a Product (quantity), or Leftovers (only if the Meal Type allows).
- Slots can be added/removed per Meal. A hand-added slot takes the picked item's Role, else its Kind; if several, the user chooses (first pre-selected).
- A Meal can be marked Untracked while planning or confirming.

### Meal Series
- A Meal dated today or later can repeat: "Repeat on" shows the seven weekdays as tick boxes (all = daily, one = weekly, none = no repeat).
- A repeat is an ordinary Meal. It copies the series' name, Meal Type, hour and slots' Slot Categories, with every slot empty; food is never repeated and Suggestions fill the slots as usual.
- Repeats are created only within the planner's two weeks, on days after the starting Meal; when a new week comes into view its repeats are added. A repeat is created even if that day already has a Meal of the same Meal Type.
- Editing a repeat's hour, name, slots (added, removed, Slot Category) or "Repeat on" asks "only this one" or "this and all following". "All following" rewrites every later Planned repeat, including individually edited ones, and keeps food in slots that still exist; changing "Repeat on" only adds or removes repeats on the newly ticked or unticked days. Earlier, Confirmed and Skipped Meals never change.
- Filling or changing a repeat's food only affects that Meal and never asks.
- Deleting a repeat asks the same: "only this one" leaves a gap that is never recreated; "this and all following" deletes the later Planned repeats and ends the series.

### Projected Stock and warnings
- Projected Stock at a Meal = current Stock minus every Planned or Unconfirmed, non-Untracked Meal served before it. Order: date, then Meal Priority (1 first), then hour, then the Meal created first.
- Each Meal Slot with a Shortfall shows a warning listing Products and amounts short. Red if the Meal is ≤ 1 day away, amber otherwise. Never blocks.
- Changing Meal Priority never alters planned Meals; warnings recalculate immediately.

### Confirmation
- Confirming a Meal deducts, per slot: Recipe Ingredients × (slot Portions ÷ Recipe Portions), converted to Default Units; Product quantity; Leftovers nothing. Untracked Meals deduct nothing.
- Before confirming, slots can be edited. Outcomes: Confirmed, Confirmed + Untracked, Skipped.
- A Confirmed or Skipped Meal can be Reopened: opposite Stock Movements, linked to the Meal, add back exactly what its Confirmation removed.

### Unconfirmed Meals
See [#1](https://github.com/HugoBar/jeeves/issues/1). Daily 07:00 in-app badge + "Needs confirmation" list; Saturday "Close this week" banner; Monday non-dismissable resolution screen for the previous week. Unconfirmed Meals count as eaten for projections and as history for variety.

### Suggestions
- One Suggestion plus 2 alternatives per empty Meal Slot. Candidates: non-Archived Recipes and Products carrying the Slot Category.
- **Variety**: compare against Meal Slots with the same Slot Category in non-Skipped Meals from 7 days before the slot to the Sunday of the week being planned. Penalise the exact same item; if the Slot Category is a Role, also penalise each shared Kind. Nearer slots weigh more (linear decay).
- **Stock coverage**: bonus by fraction of the candidate's needs met by Projected Stock, weighted by days until the Meal (1.0 today → 0.2 at +6 days). Switched off for Untracked Meals.
- All weights and N are constants in `core`, tuned later.
- "Fill empty slots" fills the week day by day, highest Meal Priority first within a day; each fill accounts for previous fills.

### Shopping List
- One current list, no history. Items come from Shortfalls over a chosen date range (default: the planned week) or are added by hand. Removable.
- Ticking marks an item as in the cart; it can be unticked and never changes Stock. Regenerating keeps manual items and items already on the list, with their tick.
- "Restock ticked items" asks for each ticked item's quantity bought (pre-filled with the pack-rounded amount, editable), performs one Restock per item and removes those items from the list.
- While Unconfirmed Meals exist, the list shows a "stock uncertain" banner and flags affected Products.

### Platform
- One Next.js + TypeScript app; all domain logic in a framework-free `core` module (ADR 0001). Drizzle + Postgres (ADR 0002). Self-hosted as a Docker container.
- One Household Time Zone (HTZ) decides "today" everywhere (Unconfirmed, week boundaries, 07:00 badge, days-until-Meal, Meal Series). Default: the first browser's time zone, saved once; changeable in Settings. Meal dates and hours never change with it.
- Mobile-first, responsive, installable PWA. English UI, i18n-ready: every user-facing string comes from the centralised UI strings file, including seeded data (Food Categories, Meal Types), which is stored by stable key. Only text the user types (names, steps, renames of seeded items) is stored as-is.
- No authentication in V1 (LAN only).

## Out of scope (later)
Web push, low-stock alerts and Always Stocked Products, whole-meal Suggestions, UI translations, auth and remote access, expiry dates, batches, Shopping List history, repeating food in a Meal Series, starting a Meal Series from a past Meal.
