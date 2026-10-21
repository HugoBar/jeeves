# Meal Series

Status: ready-for-agent
Blocked by: 08

See `../spec.md` (Meal Series). Glossary: Meal Series, Meal, Meal Slot, Slot Category.

## Acceptance
- "Repeat on" (seven weekday tick boxes) on any Meal dated today or later; not offered on past Meals.
- Repeats are ordinary Meals copying the series' name, Meal Type, hour and slots' Slot Categories, all slots empty. Created only within the planner's two weeks, after the starting Meal; a new week's repeats are added when it comes into view. Created even if the day already has a Meal of that Meal Type.
- Editing a repeat's hour, name, slots or "Repeat on" asks "only this one" / "this and all following". All following: rewrites later Planned repeats (including individually edited ones), keeps food in slots that still exist; "Repeat on" changes only add/remove repeats on newly ticked/unticked days. Earlier, Confirmed and Skipped Meals never change.
- Filling or changing food in a repeat never asks and only affects that Meal.
- Deleting asks the same: "only this one" leaves a gap that is never recreated; "this and all following" deletes later Planned repeats and ends the series.
- The planner shows nothing extra on a repeat: just its name (or Meal Type).
