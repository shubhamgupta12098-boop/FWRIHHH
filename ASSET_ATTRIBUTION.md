# Third-party image attribution

FoodWise Pro v22 uses one online fallback image when a locally cached/generated planner image is not yet available:

- **The Dal Chawal.jpg** — author: **Alone mask**, Wikimedia Commons.
- Source: https://commons.wikimedia.org/wiki/File:The_Dal_Chawal.jpg
- License: **CC BY-SA 4.0** — https://creativecommons.org/licenses/by-sa/4.0/
- The application references the original Wikimedia-hosted file and does not bundle or modify the image.

When Cloudflare Workers AI is configured, FoodWise generates and caches a planner-specific meal image instead of relying on this fallback.
