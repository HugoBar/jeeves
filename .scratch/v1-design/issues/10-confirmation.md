# Confirming and skipping Meals

Status: ready-for-agent
Blocked by: 08

See `../spec.md` (Confirmation). Glossary: Confirmation, Untracked, Skipped.

## Acceptance
- From any past or current Meal: Confirm as planned, edit slots then Confirm, or Skip. Untracked toggle available at confirmation.
- Confirmation writes one Stock Movement per affected Product: Recipe Ingredients x (slot Portions / Recipe Portions) converted to Default Units; Product slot quantity; Leftovers nothing; Untracked Meals nothing. The clamping rule from ticket 05 applies.
- Confirmed and Skipped Meals become read-only in the planner, with an explicit Reopen that writes opposite Stock Movements, linked to the Meal, adding back exactly what the Confirmation removed (after any clamping).
- Deduction logic in `core` with tests.
