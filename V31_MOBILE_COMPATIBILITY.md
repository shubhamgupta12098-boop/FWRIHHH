# FoodWise Pro v31 — Mobile compatibility

- Android voice now falls back from Web Speech Recognition to MediaRecorder + server transcription.
- Server transcription uses Gemini audio input first, then Cloudflare Workers AI Whisper if configured.
- Voice Inventory always includes a typed-answer fallback so the flow never gets blocked by browser microphone APIs.
- Browsers without Web Notifications now use in-app FoodWise alerts instead of showing a dead “not supported” state.
- Lock-screen/background notifications still require a browser/PWA that exposes Web Notifications + Service Worker Push.
- Mobile cache version bumped to v31.
