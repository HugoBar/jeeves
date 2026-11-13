# Jeeves V1

Domain language: `GLOSSARY.md`. Architecture decisions: `docs/adr/`. Every capitalised term below is a glossary term.

## Problem

I want one place that knows what food is in my Pantry, what I can cook from it, and what I plan to eat - so that eating a meal keeps Stock accurate, I get varied meal Suggestions, and I can build a Shopping List from what my plan is short of.

## Scope

### Pantry
- Products have a Default Unit (g, ml, pc), optional Density, optional Pack Size, and Food Categories. "Remove" Archives; hard delete only when unreferenced.
- Stock changes only through Stock Movements: Restock, Discard, Correction, Confirmation. Every movement is recorded with its reason.
- Stock is a decimal and never goes below 0. A deduction that would go negative clamps to 0 and flags the Product as "stock was probably wrong". Only a Correction clears the flag: a Restock adds to a Stock that may still be wrong.

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
- "Remove" Archives a category in use; hard delete only when unreferenced. Either way the category is gone from every picker.
- An Archived category stays on past Meals and on the Products and Recipe overrides that carry it, but is hidden and ignored: Recipes don't derive it and Suggestions don't match on it.
- A Planned Meal Slot, Template slot or Series slot whose Slot Category is Archived shows "Category archived - pick another" and gets no Suggestions until it is changed.

### Meal Types and Meal Templates
- Meal Types (editable) carry Meal Priority and "allows Leftovers". Seeds: Breakfast (P2), Lunch (P1, Leftovers), Snack (P3), Dinner (P1, Leftovers). Names such as "Morning Snack" are Meal or Meal Template names, not Meal Types.
- Meal Templates: name, hour, one Meal Type, optional ordered Meal Slots each with a Slot Category. Several per Meal Type. A template is only a shortcut: creating a Meal from it copies its name, Meal Type, hour and empty slots, and the Meal keeps no link to it. Editing or deleting a template never changes existing Meals. No templates are seeded.

### Planning
- Planner covers the current week and next week (Monday–Sunday), both always editable.
- The two weeks must look different: header ("THIS WEEK · 20–26 Oct" / "NEXT WEEK · 27 Oct–2 Nov"), a distinct accent colour for next week, and an "Editing: next Tuesday" label on Meal forms. Today is highlighted.
- A Meal is created on a date either from scratch (pick a Meal Type and an hour) or from a Meal Template. A Meal made from scratch can have slots added on its form before it is saved; they are added the same way as on the planner, and the Meal and its slots are saved together or not at all. A day can have several Meals of the same Meal Type. Meals are sorted by hour.
- A Meal has its own hour and optional name, both editable; its Meal Type never changes. Its card shows the name if set, else the Meal Type.
- Picking for a slot shows only Recipes/Products carrying its Slot Category. A Meal Slot holds a Recipe (Portions, default = Recipe's Portions), a Product (quantity), or Leftovers (only if the Meal Type allows).
- A planned slot's Slot Category can be changed to any non-Archived Role or Kind. The food in it stays, even if it doesn't carry the new one; only what fills it from now on must.
- Slots can be added/removed per Meal. A hand-added slot takes the picked item's Role, else its Kind; if several, the user chooses (first pre-selected).
- A Meal can be marked Untracked while planning or confirming.

### Meal Series
- A Meal dated today or later can repeat: "Repeat on" shows the seven weekdays as tick boxes (all = daily, one = weekly, none = no repeat). The starting Meal belongs to the series even if its own weekday isn't ticked.
- A repeat is an ordinary Meal. It copies the series' name, Meal Type, hour, Untracked and slots' Slot Categories in order, with every slot empty; food is never repeated and Suggestions fill the slots as usual.
- Repeats are created only within the planner's two weeks, on days after the starting Meal and never before today; when a new week comes into view its repeats are added. Days missed while the app wasn't opened are never filled in. Every screen that shows or uses Meals (Planner, Home, Needs confirmation, Generate on the Shopping List) first creates any repeats that are due. A repeat is created even if that day already has a Meal of the same Meal Type. A series whose Meal Type is Archived creates no new repeats.
- Changes on a repeat's card in the Planner (Add slot, Change Slot Category, Remove Slot, Empty) apply to that Meal only and never ask. To change the series, open Edit Meal.
- Editing a repeat's hour, name, Untracked or slots (added, removed, reordered, Slot Category) on Edit Meal asks "only this one" or "this and all following" on Save. A slot added there keeps its food on that Meal; with "all following" it becomes a series slot and every later Planned repeat gets it empty. "All following" rewrites every later Planned repeat to match the series, including individually edited ones: slots added to one repeat only are removed with their food, and food stays in a slot while the series slot it came from still exists. Earlier, Confirmed and Skipped Meals never change.
- Changing "Repeat on" never asks: on Save it applies from this Meal onwards, adding or removing repeats only on the newly ticked or unticked days. Unticking every day ends the series from this Meal.
- Filling or changing a repeat's food, and Confirming it (including as Untracked), only affects that Meal and never asks.
- Deleting a repeat asks the same: "only this one" leaves a gap that is never recreated; "this and all following" deletes the later Planned repeats and ends the series.
- An ended series creates no new repeats; its earlier Meals keep their "Repeats" label. The series itself is removed once no Meal belongs to it.
- A repeat shows a "Repeats" label with the series' days: "Repeats Mon to Fri" for three or more days in a row, "Repeats daily" for all seven, "Repeats Mon, Wed, Fri" otherwise (two days in a row too: "Repeats Mon, Tue"), "Repeats Mon" for one. Weeks run Monday to Sunday, so a run never goes on past Sunday: Sat, Sun and Mon show as "Repeats Mon, Sat, Sun".

### Projected Stock and warnings
- Projected Stock at a Meal = current Stock minus every Planned or Unconfirmed, non-Untracked Meal served before it. Order: date, then Meal Priority (1 first), then hour, then the Meal created first.
- Each Meal Slot with a Shortfall shows a warning listing Products and amounts short. Red if the Meal is ≤ 1 day away, amber otherwise. Never blocks.
- Changing Meal Priority never alters planned Meals; warnings recalculate immediately.

### Confirmation
- Confirming a Meal deducts, per slot: Recipe Ingredients × (slot Portions ÷ Recipe Portions), converted to Default Units; Product quantity; Leftovers nothing. Untracked Meals deduct nothing.
- Before confirming, slots can be edited. Outcomes: Confirmed, Confirmed + Untracked, Skipped.
- In a Meal dated today or later, a slot with an Archived Recipe or Product shows "Recipe archived - pick another" (or "Product archived - pick another"). The Meal can't be Confirmed, as planned or Untracked, until the slot is changed; it can still be Skipped. A Meal whose day has passed keeps the Archived Recipe or Product and can be Confirmed with it.
- A Confirmed or Skipped Meal can be Reopened: opposite Stock Movements, linked to the Meal, add back exactly what its Confirmation removed.

### Unconfirmed Meals
See [#1](https://github.com/HugoBar/jeeves/issues/1). Daily 03:00 in-app badge + "Needs confirmation" list; Saturday "Close this week" banner; from 03:00 Monday, a non-dismissable resolution screen for any earlier week's Unconfirmed Meals. Unconfirmed Meals count as eaten for projections and as history for variety.

### Suggestions
- One Suggestion plus 2 alternatives per empty Meal Slot of a Planned or Unconfirmed Meal. Candidates: non-Archived Recipes and Products carrying the Slot Category. A slot whose Slot Category is Archived gets none. Archived Food Categories on Recipes and Products are ignored.
- Each candidate's score starts at 0, gains a Stock coverage bonus and loses a variety penalty. Highest first; ties keep the candidates' order.
- **Variety**: compare against Meal Slots with the same Slot Category in non-Skipped Meals from 7 days before the slot to the Sunday of the week being planned, the slot's own Meal included. Each such slot takes off 1 if it holds the exact same item and, if the Slot Category is a Role, 0.5 for each Kind it shares. That is scaled by how near it is: 1 on the same day, 7/8 a day apart, down to 1/8 at 7 days.
- **Stock coverage**: adds up to 2, scaled by the fraction of the candidate's needs met by Projected Stock at the slot, and by days until the Meal: 1.0 today (or a day that has passed), falling in a straight line to 0.2 at +6 days and after. Switched off for Untracked Meals.
  - A Recipe is taken at its stated Portions. Each Product it needs counts min(1, Projected Stock / need), and the fraction is their average. Minor Ingredients are left out by default. A Product whose Ingredient can't be converted counts 0, as its need is unknown. A Recipe needing nothing is fully covered.
  - A Product's quantity is only chosen once picked, so it counts as fully covered when any of it is in Projected Stock, else not at all.
- All weights, the 7-day window and the number of alternatives (2) are named constants in `core`. The balance of variety and Stock, and whether Minor Ingredients count, become settings in [#155](https://github.com/HugoBar/jeeves/issues/155).
- Using a Suggestion puts in a Recipe at its stated Portions, and a Product at the quantity it last had in a Meal Slot. A Product never in a Meal Slot asks for its quantity first.
- "Fill empty slots" fills the week shown day by day, highest Meal Priority first within a day; each fill accounts for previous fills. On this week it fills today and later only. A slot whose Suggestion is a Product never in a Meal Slot stays empty, and the result says so. It never overwrites a slot that holds something, and Undo empties only the slots still holding what it put in.
- "Use all N Suggestions" fills one Meal's empty slots the same way.

### Shopping List
- One current list, no history. Items come from Shortfalls over a chosen date range (default: the planned week) or are added by hand. Removable at once; only a ticked item asks first, as Restock won't add it to Stock once removed.
- Ticking marks an item as bought; it can be unticked and never changes Stock.
- Generate keeps the list in step with what is short over the chosen dates, one unticked item per Product. A Product needs its Shortfall less its ticked items. Its unticked item from Shortfalls is set to that, up or down, and removed when nothing is needed or the Product is not short over these dates, whichever dates the item first came from. Its unticked item added by hand is raised to that when below it (no amount counts as 0), never lowered or removed. An item counts as added by hand once part of it was chosen: added by hand, or added by hand again (even with no Pack Size to add), its amount set, or unticked into one added by hand. Generate never changes a ticked item, so generating twice changes nothing. Meals before the range still take Stock first. The Generate card names what those earlier Meals are short of, for the Products also short in the range, as it follows the chosen dates. A Product whose need can't be worked out in any Meal of the range (no Density, or a unit that can't convert) is left out, and its items are left as they are.
- "Restock ticked items" asks for each ticked item's quantity bought (pre-filled with the pack-rounded amount, editable), performs one Restock per item and removes those items from the list.
- While Unconfirmed Meals exist, the list shows a "stock uncertain" banner and flags affected Products.

### Platform
- One Next.js + TypeScript app; all domain logic in a framework-free `core` module (ADR 0001). Drizzle + Postgres (ADR 0002). Self-hosted as a Docker container.
- "Today" (Unconfirmed, week boundaries, 03:00 badge and resolution screen, days-until-Meal, Meal Series) is the date in the viewer's browser time zone. Meal dates and hours are plain values and never change with it.
- Mobile-first, responsive, installable PWA. English UI, i18n-ready: every user-facing string comes from the centralised UI strings file, including seeded data (Food Categories, Meal Types), which is stored by stable key. Only text the user types (names, steps, renames of seeded items) is stored as-is.
- No authentication in V1 (LAN only).

## Out of scope (later)
Web push, low-stock alerts and Always Stocked Products, whole-meal Suggestions, UI translations, auth and remote access, expiry dates, batches, Shopping List history, repeating food in a Meal Series, starting a Meal Series from a past Meal, one shared time zone for "today" ([#61](https://github.com/HugoBar/jeeves/issues/61)).
