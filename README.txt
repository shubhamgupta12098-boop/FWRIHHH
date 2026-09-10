FOODWISE PRO v21 — PROFILE + FIREBASE + MONGODB + RENDER

LOCALHOST
1. npm install
2. npm start
3. Open http://localhost:3000
4. Default local login: local@foodwise.app / foodwise123 (unless changed in .env).

NEW IN v21
- Profile photo upload/change/remove from Profile. Photo is cropped/resized in the browser and saved with household data.
- Change Password lives inside Profile.
- Language buttons switch English / Hinglish / हिंदी instantly; no page reload is required.
- Technical connection/status cards were removed from Profile and the Local Mode info box was removed from Login.
- Dark Mode is still the default; Light Mode remains user-selectable and persistent.

CLOUD / RENDER
- Firebase Authentication handles signup/login, Forgot Password and Change Password.
- MongoDB Atlas stores users, household state and persistent sessions.
- Generated AI images use MongoDB GridFS in cloud mode.
- render.yaml is included and explicitly uses LOCAL_MODE=false.
- Read RENDER_DEPLOYMENT.md and RENDER_ENV_TEMPLATE.txt before deploying.

IMPORTANT
Never commit .env or API/database credentials.
