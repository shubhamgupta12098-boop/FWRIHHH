# FoodWise Pro v14 — Optional Daily Essentials

## What changed

- Add a daily-consumption routine once, for example **Milk · 1 L · every day · 2-day expiry**.
- FoodWise automatically creates a fresh inventory batch for each expected day when the app syncs/opens. The user is **not asked every day**.
- Expiry window for this feature is restricted to **2 or 3 days**.
- Each automatic batch has its own purchase/arrival date and expiry date.
- Expired/today batches appear in **Notifications** with clearer wording such as “Your Milk batch is expired”.
- If one expected delivery does not arrive, use **Not received today**. This removes/prevents that day’s batch without recording waste.
- Use **Pause/Resume** when the routine temporarily stops.
- Use **Discard** on an expired automatic batch to remove it from inventory and add it to the waste log.
- The entire feature is optional: households without a daily milk/food delivery can leave Daily Essentials empty.
- Device notifications can be enabled where the browser/PWA supports the Notification API. In-app expiry notifications always remain available.

## Render/MongoDB

Daily routine settings and generated batch state are stored with the rest of the household state in MongoDB, so the feature is compatible with the existing Render deployment.
