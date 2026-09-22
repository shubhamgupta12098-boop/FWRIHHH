# FoodWise Pro v29

Changes in this build:

- Removed the numeric notification badge from the top bell. Urgent reminders now show a small red dot only, so no confusing multi-digit count or extra header spacing is used.
- Added a clear **Enable & Test** mobile notification flow on the Notifications screen.
- Added service-worker notifications for expiry, leftovers, and budget alerts.
- Added Web Push subscription support (`web-push`) so Render can send notifications to subscribed mobile browsers while the service is running.
- VAPID keys are generated automatically. In Cloud Mode they are persisted in MongoDB; no VAPID environment variables are required unless you want to supply your own.
- Notification taps open the relevant FoodWise screen.
- Shopping/Cart/Order Q&A is disabled. Voice shopping questions open Shopping/Shopping List instead of going to the assistant.
- Existing voice assistant Q&A remains enabled for Inventory, Expiry, Consumed, Planner, Budget, Waste, Report, Analytics, Daily Essentials, Challenges, Household, Recipes, Nutrition, Storage and Settings.
- Existing 7-day consumed -> report-only archive behaviour is preserved.

## Render note
`render.yaml` already uses `npm install`, so the new `web-push` dependency will be installed automatically during deployment.

On Android/Chrome after deployment: open FoodWise -> Notifications -> **Enable & Test** -> Allow notifications. On iPhone/iPad, web push generally requires installing the site to the Home Screen and allowing notifications there.

Render Free services can sleep when idle, so exact background delivery timing while the app is fully closed is not guaranteed during sleep. Opening the app also checks pending alerts immediately.
