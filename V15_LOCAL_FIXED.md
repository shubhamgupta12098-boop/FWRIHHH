# FoodWise Pro v15 Local Fixed

This build focuses on a reliable localhost experience while keeping optional cloud deployment support.

## Main fixes
- Removed Share & Donate from navigation, tools and persisted state migration.
- Added top-bar voice control with English/Hinglish/Hindi command matching.
- Reworked challenges to use real actions: daily save check-in, rescued leftovers and purchased shopping items. Rewards are one-time claims.
- Rebuilt planner logic so every generated meal is composed only of live inventory items. Expired items are excluded.
- Reworked Storage Guide into item-specific, practical steps.
- Upgraded analytics with modern canvas charts including an expiry-risk map.
- Expanded Excel export to 9 sheets with AI/smart action brief, chart-ready analytics data and inventory planner data.
- Added Local Mode with JSON persistence and automatic local user. MongoDB/Firebase are not required for localhost.

## Local data
Local Mode persists household state in `data/local-state.json`. If the file does not exist, a demo household is seeded automatically.

## Optional integrations
Gemini, Cloudflare image generation, MongoDB and Firebase remain optional and are used only when configured.
