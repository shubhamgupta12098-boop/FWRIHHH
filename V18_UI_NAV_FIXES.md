# FoodWise Pro v18 — UI & Navigation Fixes

## Fixed
- Grocery Shop retailer cards no longer spill outside the Real Stores panel.
- Home `Used` action was replaced with `Inventory →`; it does **not** consume anything. It opens the exact inventory item so the user can choose the quantity there.
- Expiry Radar now has a dedicated working view with exact expiry timing and inventory navigation.
- Service-worker cache key bumped to v18 to prevent stale v17 JS/CSS from hiding the fixes.

## Consumption rule
Food quantity is consumed only from Inventory via the ✓ button, which opens the quantity selector.
