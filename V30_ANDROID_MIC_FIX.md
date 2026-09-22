# FoodWise Pro v30 — Android microphone fix

- Removed getUserMedia preflight before Web Speech recognition (prevents double-open audio-source race).
- Releases speech-synthesis audio focus before listening.
- Adds two automatic audio-capture retries with increasing delay.
- Avoids speaking the audio-capture error during retry, which could reacquire audio focus.
- Keeps the Answer button available for a direct user-gesture retry.
- Adds cache-busted app.js/style.css and a v30 service-worker cache so mobile receives the new code.
- Preserves v29 notifications, whole-app Q&A (except Shopping Q&A), persistent chat, and consumed archive logic.
