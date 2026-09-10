# FoodWise Pro v19 — Editable Consume Units

Consume flow now supports unit editing and compatible conversion:
- Mass: g ↔ kg
- Volume: ml ↔ L
- Count: pcs

Examples:
- Inventory `1 kg` → consume `250 g` → inventory keeps `0.75 kg`.
- Inventory `1 L` → consume `300 ml` → inventory keeps `0.7 L`.
- Quick 25% / 50% / All buttons respect the currently selected unit.
- Restore converts consumed quantity back into the live inventory unit.
- Fully consumed items restore using the original inventory quantity/unit.
