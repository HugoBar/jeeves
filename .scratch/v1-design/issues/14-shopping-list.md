# Shopping List

Status: ready-for-agent
Blocked by: 05, 09

See `../spec.md` (Shopping List).

## Acceptance
- One current list. "Generate" adds Shortfall items for a chosen date range (default: the planned week), merged per Product.
- Add items by hand; remove any item. Regenerating keeps manual items and items already on the list, with their tick.
- Items display Pack Size rounding ("2 bags (1,300 g needed)") when the Product has a Pack Size.
- Ticking marks an item as in the cart; untick freely, Stock never changes.
- "Restock ticked items" asks for each ticked item's quantity bought (pre-filled with the pack-rounded amount, editable), performs one Restock per item and removes those items.
- While Unconfirmed Meals exist: "stock uncertain" banner and affected Products flagged.
