# FoodWise Pro v13 — Render + MongoDB + Firebase

## Architecture
- Firebase Authentication: email/password login, account creation and Forgot Password email.
- MongoDB: users, FoodWise household state, long-lived login sessions, inventory/waste/planner/shop data, and generated food images (GridFS).
- Render: Node.js web service hosting the mobile-first PWA and API.
- Gemini / Cloudflare: optional AI services configured only as server environment variables.

## 1. Firebase
1. Open Firebase Console for the project that owns your Web API key.
2. Authentication → Sign-in method → enable **Email/Password**.
3. Authentication → Templates → Password reset: optionally customize sender/template.
4. After Render deploys, add the Render domain under Authentication → Settings → Authorized domains if your Firebase configuration requires it.

FoodWise never stores account passwords in MongoDB. Login and password reset are validated by Firebase.

## 2. MongoDB Atlas
1. Create a free Atlas cluster and database user.
2. Add Network Access that allows your Render service to connect. For a student/demo deployment, many people temporarily use 0.0.0.0/0 with a strong DB password; tighten access for production.
3. Copy the `mongodb+srv://...` connection string.

## 3. Render
Push this folder to GitHub. `.env` is intentionally ignored. In Render:
1. New → Blueprint and select the repository (Render can read `render.yaml`), or create a Node Web Service manually.
2. Set Environment values: `MONGODB_URI`, `FIREBASE_API_KEY`, and optional `GEMINI_API_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`.
3. `SESSION_SECRET` is generated automatically by the Blueprint. If deploying manually, set a long random string.
4. Build command: `npm install`; start command: `npm start`. Do not set `PORT`; Render supplies it.
5. Verify `/api/health` returns MongoDB `connected`.

## 4. Local run
Copy `.env.example` values into `.env` (this ZIP already contains the Firebase key you supplied locally), set `MONGODB_URI`, then:
```powershell
npm install
npm start
```
Open `http://localhost:3000`.

## Forgot Password flow
Login screen → **Forgot password?** → enter email → Firebase sends the reset email → user changes password on Firebase's secure action page → return to FoodWise and login with the new password.

## Important
- Do not commit `.env`.
- Generated AI food images are saved in MongoDB GridFS, so Render restarts do not delete them.
- App login/create-account/forgot-password screens remain English. App language is changed only after login in Settings.
