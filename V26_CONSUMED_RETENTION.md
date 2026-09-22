# FoodWise Pro v26 — 7-Day Consumed Retention

- A consumed item remains in the Consumed tab for 7 days so it can be restored if marked by mistake.
- At 7 days, the backend removes the detailed consumed record from operational state.
- Only a compact report archive row remains: item name, consumed quantity/date, original expiry and cost.
- Images, source inventory IDs, original quantities, restore metadata, award metadata, storage/category data and other detailed item fields are not kept in the archived report row.
- Smart Report and Excel Consumed History include the compact archive.
- Backend GET/PUT migration enforces cleanup, including MongoDB and local JSON mode.
