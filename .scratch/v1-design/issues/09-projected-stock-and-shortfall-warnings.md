# Projected Stock and Shortfall warnings

Status: ready-for-agent
Blocked by: 08

See `../spec.md` (Projected Stock and warnings).

## Acceptance
- `core` computes Projected Stock per Meal: current Stock minus every Planned or Unconfirmed, non-Untracked Meal served before it, ordered by date, then Meal Priority, then hour, then the Meal created first. Recipe slots scale by Portions / Recipe Portions; Leftovers needs nothing.
- Each slot with a Shortfall shows the Products and amounts short; red if the Meal is 1 day away or less, amber otherwise. Never blocks saving.
- Changing Meal Priority or Stock recalculates warnings; planned Meals are never altered.
- Tested in `core`, including same-day priority contention and cross-day ordering.
