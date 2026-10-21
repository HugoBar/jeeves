# Resolving Unconfirmed Meals

Status: resolved
Type: grilling

Parked during the V1 design grilling (2026-10-19). Come back to this once the rest of the design tree is settled.

## Question

What happens to Meals whose day has passed without a Confirmation?

Agreed so far:
- An in-app alert is raised at **07:00** the following morning (not midnight). V1 = in-app badge; web push in a later update.
- Planning the next week must never be blocked by Unconfirmed Meals.
- A shopping list generated while Unconfirmed Meals exist should carry a prominent "stock uncertain" warning.
- Possible outcomes for a past Meal: Confirmed, Confirmed + Untracked, Skipped.

Open:
- After how many days (if ever) do we force a resolution, and what does "force" look like (blocking modal, auto-confirm as planned, auto-skip)?
- Is there an "Unconfirmed" inbox, and a "confirm all as planned" shortcut?
- How exactly does the shopping list treat Products touched by Unconfirmed Meals?

## Answer

Goal: no week closes with Unconfirmed Meals, while planning is never blocked.

- **Daily**: 07:00 in-app badge leading to a dismissable "Needs confirmation" list. Each Meal offers Confirm as planned / Edit then confirm / Skip; a "Confirm all as planned" shortcut sits on top. (May be revisited after real use.)
- **From Saturday**: the planner shows a "Close this week" banner listing the current week's Unconfirmed Meals.
- **Monday**: if the previous week still has Unconfirmed Meals, the app opens on a non-dismissable resolution screen (Confirm all as planned, per-Meal Skip/Edit) until cleared.
- **Projected Stock / Shopping List**: Unconfirmed Meals are treated as eaten as planned for projection only (real Stock untouched until Confirmation); affected Products are flagged "uncertain".
- **Suggestions**: Unconfirmed Meals count toward variety like Planned Meals.
