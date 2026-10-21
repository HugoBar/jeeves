# Products and Stock

Status: ready-for-agent
Blocked by: 03, 04

See `../spec.md` (Pantry). Glossary: Product, Stock, Stock Movement, Restock, Discard, Correction, Archived.

## Acceptance
- Create/edit Products: name, Default Unit (g/ml/count, fixed after creation), optional Density, optional Pack Size (name + amount), Food Categories.
- Stock list view: every non-Archived Product with its Stock.
- Restock, Discard and Correction actions; each writes a Stock Movement with type, delta, resulting quantity and timestamp. Stock Movement history visible per Product.
- Stock never goes below 0: a deduction past 0 clamps and sets a "stock was probably wrong" flag on the Product, cleared by the next Correction or Restock.
- "Remove" Archives; hard delete only when nothing references the Product.
- Stock-changing logic lives in `core` with tests.
