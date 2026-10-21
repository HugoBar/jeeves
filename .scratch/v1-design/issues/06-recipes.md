# Recipes

Status: ready-for-agent
Blocked by: 03, 05

See `../spec.md` (Recipes). Glossary: Recipe, Ingredient, Minor Ingredient, Portion, Food Category.

## Acceptance
- Create/edit/view Recipes: name, Portions, Ingredients (Product, amount, unit, Minor flag), steps (markdown), prep time, optional source URL.
- Saving is refused if any Ingredient's unit can't convert to its Product's Default Unit; the error names the Ingredient and the missing Product field.
- Food Categories = union of non-Minor Ingredients' Products' categories, plus stored per-Recipe "add" and "remove" overrides that survive Ingredient edits. The edit screen shows both the derived and final sets.
- "Remove" Archives; hard delete only when unreferenced.
- Derivation logic in `core` with tests.
