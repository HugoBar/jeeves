# Meal Types and Meal Templates

Status: ready-for-agent
Blocked by: 04

See `../spec.md` (Meal Types and Meal Templates).

## Acceptance
- Meal Types editable: name, Meal Priority (1 = highest), allows Leftovers.
- Seeded: Breakfast P2, Lunch P1 (Leftovers), Snack P3, Dinner P1 (Leftovers). No Meal Templates are seeded.
- Seeded Meal Types are stored with a stable key (e.g. `breakfast`) and displayed via the UI strings file; a user rename stores that name, which then overrides the key's string. Same rule as Food Categories (ticket 04).
- Meal Templates: name, hour, Meal Type, optional ordered Meal Slots each with a Slot Category (any Role or Kind). Several templates per Meal Type.
- Editing or deleting a template does not affect Meals already created from it (Meals keep no link to their template).
