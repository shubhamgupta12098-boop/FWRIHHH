FOODWISE PRO v22 — VOICE INVENTORY + SMART PLANNER IMAGES

LOCALHOST
1. npm install
2. npm start
3. Open http://localhost:3000
4. Default local login: local@foodwise.app / foodwise123 (unless changed in .env).
5. For voice control, use current Chrome/Edge and allow Microphone permission.

NEW IN v22
- Conversational voice inventory: say e.g. "inventory mein dal add kar do".
- FoodWise then asks the required details by voice: quantity, storage location, expiry/best-before and cost, followed by a spoken confirmation.
- Voice-added inventory can automatically receive a Cloudflare AI food image when Cloudflare image AI is configured.
- Planner converts useful ingredient combinations into dish names, e.g. Dal + Rice -> Dal Chawal, Rajma + Rice -> Rajma Chawal, Oats + Banana -> Banana Oats Bowl.
- Planner shows a cooked-meal image instead of an inventory/raw-food image. Cloudflare can generate/cache a meal-specific image; Dal Chawal also has an online CC BY-SA fallback.
- Voice command can set meal size, e.g. "cooking for 3".
- Voice navigation, consumed-items view, Auto Plan, theme commands and report download remain supported.

FROM v21
- Profile photo upload/change/remove from Profile.
- Change Password inside Profile.
- Instant English / Hinglish / हिंदी switching.
- Firebase Authentication + MongoDB Atlas + Render cloud deployment support.
- Dark Mode default; Light Mode optional and persistent.

CLOUD / RENDER
- Firebase Authentication handles signup/login, Forgot Password and Change Password.
- MongoDB Atlas stores users, household state and persistent sessions.
- Generated AI inventory/planner images use MongoDB GridFS in cloud mode.
- render.yaml is included and explicitly uses LOCAL_MODE=false.
- Read RENDER_DEPLOYMENT.md and RENDER_ENV_TEMPLATE.txt before deploying.

IMPORTANT
Never commit .env or API/database credentials.
See ASSET_ATTRIBUTION.md for third-party fallback image licensing.
