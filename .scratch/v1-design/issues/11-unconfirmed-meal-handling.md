# Unconfirmed Meal handling

Status: ready-for-agent
Blocked by: 10

Implements the resolution recorded in `01-resolving-unconfirmed-meal-slots.md`.

## Acceptance
- A Meal becomes Unconfirmed once its day has passed. From 07:00 the next day, an in-app badge shows the count.
- "Needs confirmation" list: each Meal with Confirm as planned / Edit then confirm / Skip; "Confirm all as planned" at the top. Dismissable.
- From Saturday, the planner shows a "Close this week" banner listing the week's Unconfirmed Meals.
- On Monday (and after), if the previous week has Unconfirmed Meals, the app opens on a non-dismissable resolution screen until they're cleared.
