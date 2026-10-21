# Week planner

Status: ready-for-agent
Blocked by: 05, 06, 07

See `../spec.md` (Planning). Glossary: Meal, Meal Slot, Slot Category, Leftovers, Untracked, Planned.

## Acceptance
- Planner for the current and next week (Mon-Sun), both editable;
- Visual distinction: "THIS WEEK · dates" / "NEXT WEEK · dates" header, distinct accent colour for next week, "Editing: next <day>" label on Meal forms, today highlighted.
- Create a Meal on a day from scratch (Meal Type + hour, no slots) or from a Meal Template (copies its name, Meal Type, hour and empty slots). Several Meals of the same Meal Type per day allowed. Meals sorted by hour.
- Edit a Meal's hour and optional name; its Meal Type is fixed. The card shows the name if set, else the Meal Type.
- Slots copied from a template appear empty. Picking for a slot lists only non-Archived Recipes/Products with its Slot Category. Recipe slot Portions default to the Recipe's Portions, editable; Product slots take a quantity; Leftovers offered only where the Meal Type allows.
- Add/remove slots per Meal. A hand-added slot takes the picked item's Role, else its Kind; if several, a chooser with the first pre-selected.
- Mark a Meal Untracked.
- Works well at phone width.
