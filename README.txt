FoodWise Pro v13 — Render + MongoDB + Firebase

MOBILE-FIRST PWA
- Responsive phone UI
- Installable PWA manifest + service worker
- English Login / Create Account / Forgot Password screens
- App language after login: English / Hinglish / Hindi

AUTHENTICATION
- Firebase Email/Password authentication
- Create Account creates a Firebase user and a matching MongoDB profile
- Forgot Password sends Firebase password-reset email
- Passwords are not stored in MongoDB
- Login session is stored in MongoDB and survives Render/server restarts until explicit Log out

DATABASE
- MongoDB stores each user's household app state independently
- Inventory, expiry, leftovers, planner, waste, shopping, reports, family settings, language, etc. are stored per user
- Cloudflare-generated food images are stored persistently in MongoDB GridFS instead of Render's temporary disk

LOCAL RUN
1. Set MONGODB_URI in .env
2. In Firebase Console enable Authentication > Email/Password
3. Run: npm install
4. Run: npm start
5. Open: http://localhost:3000

RENDER
Use render.yaml or create a Node Web Service. Set Render Environment values for MONGODB_URI, FIREBASE_API_KEY, and any Gemini/Cloudflare keys. See RENDER_DEPLOYMENT.md.

SECURITY
.env is ignored by Git. Do not push .env to GitHub.


V14: Optional Daily Essentials auto-tracking (e.g. 1 L milk daily with 2–3 day expiry), skip/pause/discard, and expiry notifications.
