# Unit conversion in core

Status: ready-for-agent
Blocked by: 02

Pure `core` logic; no UI. See `../spec.md` (Units).

## Acceptance
- Supported units: g, kg, ml, l, tsp (5 ml), tbsp (15 ml), cup (250 ml), pc. Decimal amounts.
- Convert any amount to a Product's Default Unit; mass to/from volume via Density; count never converts.
- An impossible conversion returns a typed error naming the cause (e.g. "Product has no Density", "count cannot convert to mass").
- Pack rounding helper: given an amount and a Pack Size, return whole packs (rounded up) and the real amount.
- Fully unit-tested.
