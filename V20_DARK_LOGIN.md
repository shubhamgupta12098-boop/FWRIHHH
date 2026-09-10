# FoodWise Pro v20 — Dark First + Local Login

## What changed
- Fresh/updated v20 starts in Dark Mode by default.
- If the user switches to Light Mode from Household & Account, that choice persists for future opens.
- Localhost now has a real login gate instead of auto-entering the app.
- Local logout returns to the Login screen.
- Create Account works in Local Mode and stores a password hash in `data/local-auth.json`.
- Local state remains in `data/local-state.json`.
- Existing v19 local state is migrated once to v20 and Dark Mode. After that, user theme changes are preserved.

## First local login
Default first-run credentials (change them in `.env` if you want):
- Email: `local@foodwise.app`
- Password: `foodwise123`

Or use **Create Account** on the Login screen to create your own local login.

## Run
`npm start` then open `http://localhost:3000`.
