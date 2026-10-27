# Jeeves

Jeeves manages a household pantry: what food is in stock, which recipes can be made from it, and which meals are planned and eaten.

## Pantry

**Pantry**:
The household's food that Jeeves tracks: what is in Stock and what Recipes are cooked from.
_Avoid_: Inventory, storage

**Product**:
A kind of food that can be in stock, such as Apple, Rice or Olive Oil, measured in one Default Unit.
_Avoid_: Item, ingredient (when talking about stock), food

**Default Unit**:
The single unit a Product's stock is counted in: grams (g), millilitres (ml) or pieces (pc).
_Avoid_: Base unit, stock unit

**Stock**:
The current quantity of a Product in the Pantry, in its Default Unit. Has no batches or expiry dates.
_Avoid_: Inventory level, batch

**Density**:
A Product's weight-per-volume, used to convert between mass and volume units. Count-based Products never convert.

**Pack Size**:
An optional named package amount for a Product, such as "bag = 1000 g", used only when displaying the Shopping List.
_Avoid_: Package unit (in Recipes)

**Restock**:
Adding to a Product's Stock because food was bought.
_Avoid_: Add

**Discard**:
Taking food out of a Product's Stock outside of a Confirmation, such as when food is thrown away.
_Avoid_: Remove (when talking about Stock), waste

**Correction**:
Setting a Product's Stock to the quantity actually on hand, fixing drift.
_Avoid_: Adjustment, recount

**Confirmation**:
Marking a Meal as eaten, which deducts from Stock the Products its Meal Slots used. It is the only way eating a Meal changes Stock.
_Avoid_: Check-in, logging

**Reopen**:
Undoing a Meal's Confirmation or Skip, which returns it to Planned or Unconfirmed and adds back the Stock its Confirmation deducted.
_Avoid_: Undo, unconfirm

**Stock Movement**:
A recorded change to a Product's Stock, caused by a Restock, Discard, Correction, Confirmation or Reopen. Every change to Stock is a Stock Movement.
_Avoid_: Transaction, log entry

**Projected Stock**:
What a Product's Stock is expected to be at a given Meal, after deducting every Planned or Unconfirmed, non-Untracked Meal that is served before it (by day, then Meal Priority, then hour) from current Stock.
_Avoid_: Future stock, forecast

**Shortfall**:
The amount by which Projected Stock falls short of what a Meal Slot needs.
_Avoid_: Missing stock, deficit

**Shopping List**:
The single, current list of Products to buy, filled from Shortfalls or by hand. Ticking an item marks it as bought without changing Stock; Restocking the ticked items adds them to Stock and removes them from the list.
_Avoid_: Grocery list, cart

## Recipes

**Recipe**:
A named dish, such as Steak or Lasagne, written for a stated number of Portions, with the Ingredients needed for that many.
_Avoid_: Dish, meal (when talking about the definition)

**Archived**:
A Recipe, Product, Food Category or Meal Type hidden from pickers and Suggestions but kept by whatever already refers to it, such as past Meals or a Meal Template.
_Avoid_: Deleted

**Remove**:
Getting rid of a Recipe, Product, Food Category or Meal Type: it is hard deleted if nothing refers to it, and Archived otherwise.
_Avoid_: Delete, Discard

**Ingredient**:
A Product plus an amount, in any supported unit, needed to make a Recipe's stated Portions.

**Minor Ingredient**:
An Ingredient used in small amounts, such as seasoning or garnish, that does not contribute Food Categories to its Recipe. It is still deducted from Stock.
_Avoid_: Garnish, optional ingredient

**Portion**:
One person's share of a Recipe, always counted in whole numbers. A Meal Slot's Portions start at the Recipe's stated number and can be changed, scaling the Ingredients deducted.
_Avoid_: Serving, yield

**Food Category**:
A user-defined label, either a Role or a Kind. Products carry Food Categories; a Recipe's are derived from its non-Minor Ingredients' Products, then adjusted by its Food Category Overrides.
_Avoid_: Tag, food type

**Food Category Override**:
A per-Recipe "add" or "remove" of one Food Category, stored apart from the Ingredients so it survives Ingredient edits. A Recipe's final Food Categories are the derived ones plus its "add" overrides, minus its "remove" ones.
_Avoid_: Manual category, custom tag

**Role**:
A Food Category describing the part food plays in a meal, such as Main Dish or Side Dish. Used to find alternatives that can take the same place.
_Avoid_: Course, dish type

**Kind**:
A Food Category describing what food is, such as Fish, Red Meat, Grains or Fruit. Used to judge variety.
_Avoid_: Food type, food group

## Meal planning

**Meal Type**:
An editable kind of meal, such as Breakfast, Lunch or Dinner, carrying a Meal Priority and whether Leftovers are allowed. A day can have several Meals of the same Meal Type.
_Avoid_: Slot category, meal category

**Meal Priority**:
A Meal Type's rank (1 = highest) when Meals on the same day compete for the same Stock; the higher-priority Meal is served first, and on a tie the earlier hour. Across different days, earlier days are always served first.
_Avoid_: Weight, importance

**Meal Template**:
A named, user-created shortcut for creating a Meal with preset settings, such as "Weekday Lunch": an hour, one Meal Type, and an optional ordered list of empty Meal Slots, each with a Slot Category. A Meal Type can have several. Editing one never changes Meals already created from it.
_Avoid_: Meal pattern, layout, meal definition

**Meal**:
One Meal Type eaten on a specific date, such as Tuesday's Lunch, with its own hour, Meal Slots and optional name (such as "Morning Snack"), shown in place of the Meal Type when set. It can be created from scratch or from a Meal Template, which only pre-fills it. It is Planned, Confirmed, Skipped or Unconfirmed as a whole.
_Avoid_: Meal slot (for the whole meal), plan entry

**Meal Series**:
Meals that repeat on chosen weekdays, sharing a Meal Type, an hour, a name and the Slot Categories of their Meal Slots, but not what fills them. Each repeat is an ordinary Meal. Only a Meal dated today or later can start one. Editing or deleting one asks whether it applies to only that Meal or to it and all following; earlier Meals never change.
_Avoid_: Recurrence, routine, repeating template

**Meal Slot**:
One position in a Meal or Meal Template, holding one Recipe (with Portions), one Product (with a quantity), or Leftovers.
_Avoid_: Meal item, course

**Slot Category**:
The single Food Category every Meal Slot has: set on the Meal Template, or for a slot added by hand, taken from the Role (else the Kind) of the Recipe or Product put in it. Only Recipes and Products carrying it can fill the slot, and it decides which past slots it is compared against for variety.
_Avoid_: Slot type

**Leftovers**:
What a Meal Slot holds when it is filled with food already deducted when first cooked, so eating it deducts nothing. Has no Food Categories, and is only offered in Meal Types that allow it.

**Planned**:
A Meal whose day has not yet passed and that has not been Confirmed or Skipped.

**Suggestion**:
A Recipe or Product proposed for a Meal Slot from those carrying its Slot Category, ranked by variety against nearby Meal Slots with the same Slot Category and by Stock coverage.
_Avoid_: Recommendation

**Untracked**:
A Meal, Planned or Confirmed, made from food outside the Pantry, such as a meal eaten out: it counts toward meal history but never deducts or projects Stock.
_Avoid_: Not counted, external meal

**Skipped**:
A past Meal in which nothing was eaten: it counts toward neither history nor Stock.

**Unconfirmed**:
A Meal whose day has passed without being Confirmed or Skipped.

**Household Time Zone** (HTZ):
The one time zone that decides what "today" is everywhere in the app: when a Meal becomes Unconfirmed, which week is current, and how many days away a Meal is. Meal hours are fixed times of day and are not affected by it.
_Avoid_: Server time, local time
