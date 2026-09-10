# FoodWise Pro v21 — Profile + Cloud/Render

- Profile photo can be chosen from device/camera, resized client-side and stored with household data.
- Profile now contains Change Password. Local Mode updates the hashed local password; Cloud Mode verifies the current Firebase password and updates it through Firebase Authentication.
- Language uses three instant buttons (English / Hinglish / हिंदी). No browser reload is required.
- Technical AI/backend connection cards were removed from Profile for a cleaner user screen.
- Login Local Mode technical box was removed.
- Forgot Password is backed by Firebase in Cloud/Render mode.
- MongoDB Atlas stores users, household state, sessions and GridFS AI images in Cloud Mode.
- render.yaml explicitly sets LOCAL_MODE=false and requests MongoDB/Firebase secrets.
- Dark mode remains the first-run default; user-selected Light Mode persists.
