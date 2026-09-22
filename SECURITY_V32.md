# FoodWise Pro v32 Security Hardening

This release adds defense-in-depth without changing the main FoodWise workflow.

- Production cookies use the `__Host-` prefix, `Secure`, `HttpOnly`, `SameSite=Lax`, and 30-day sessions.
- Cloud Mode refuses a weak/missing `SESSION_SECRET` (<32 characters). Render `generateValue` is already configured.
- Login, signup, password reset, AI, speech, image generation, state writes, and push tests are rate-limited.
- Cross-site mutating browser requests are blocked using Fetch Metadata / Origin checks.
- Security headers include CSP, HSTS in production, anti-clickjacking, no-sniff, referrer restrictions and a restrictive Permissions Policy.
- JSON bodies are size-limited, structurally sanitized, and prototype-pollution keys are removed.
- New/change-password flows require 10+ characters including letters and numbers.
- Changing a Cloud Mode password revokes all existing sessions and issues a fresh session.
- Generated image URLs require authentication and use private caching.
- Static file serving uses resolved paths to harden traversal checks.
- Public health/config responses expose less infrastructure detail.
- `.env`, local auth/state, and local session secrets remain ignored by Git.

## Render
Keep all real credentials in Render > Environment. Never commit `.env`. Required Cloud Mode values: `MONGODB_URI`, `SESSION_SECRET`, and `FIREBASE_API_KEY`; AI keys are optional.

After deploying v32, existing production sessions may need one fresh login because the hardened cookie name changes to `__Host-fw_session`.
