# Suggestion engine (core)

Status: ready-for-agent
Blocked by: 09

Pure `core` scoring; no UI. See `../spec.md` (Suggestions).

## Acceptance
- Given a Meal Slot and the surrounding plan/history, return one Suggestion plus 2 alternatives from non-Archived Recipes/Products carrying the Slot Category.
- Variety: compare against slots with the same Slot Category in non-Skipped Meals from 7 days before to the Sunday of the planned week. Penalise the exact same item; for Role slots also penalise each shared Kind. Linear decay with distance in days.
- Stock coverage: bonus by fraction of needs met by Projected Stock x day weight (1.0 today down to 0.2 at +6 days). Off for Untracked Meals.
- All weights and the 7-day window are named constants.
- Tests cover: steak yesterday -> fish preferred in a Main Dish slot; apple yesterday -> pear preferred in a Fruit slot; an out-of-stock item ranked lower for today than for Friday.
