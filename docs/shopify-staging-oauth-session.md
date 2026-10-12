# Staging Shopify OAuth and session recovery

## Evidence and root cause

On the requested base `48e9952cd330d930ac73c37fcfdfe245bcce360e`, the home bootstrap uses `window.location.replace('/api/shopify/install?...')` in its current browsing context. The install route immediately returns a 302 to Shopify authorization. HTTP redirects retain the iframe; `isEmbeddedApp: false` only configures the SDK and does not escape it. Together with the reported `accounts.shopify.com refused to connect` inside Shopify Admin, this verifies a broken frame-to-authorization path.

Read-only Railway inspection confirmed the staging app service `7663b193-b936-41cd-a810-a4940d9912fc`, environment `43e4c163-6da9-4be5-ad93-0a3534234613`, project `1d22ff35-a259-4977-9375-377dda1cdd2b`, is sourced from the requested base branch. Retrieved logs contain repeated install 302s, auth/onboarding 401s, and no callback in the retrieved window. This is consistent with authorization never reaching the callback; it does not establish a session-store failure. The callback already awaits Passport login and persistent session save. Cookies are host-only, HttpOnly, SameSite=Lax and Secure when NODE_ENV=production; production persistence uses PostgreSQL `user_sessions` behind one trusted Railway TLS proxy hop.

The old Check connection again action only refreshes the absent session and refetches onboarding. It cannot initiate OAuth, so a signed-out user remains signed out.

## Change

Install now returns a no-store, nonce-protected handoff document. Framed execution attempts to open the same app URL at the top level. Only top-level execution proceeds to authorization. If Shopify's sandbox blocks automatic navigation, explicit top-level and new-tab links remain; the script never falls back to framed login. Valid callbacks received as iframe documents also escape before token exchange. A valid existing merchant session for the same shop skips token exchange and opens onboarding; missing sessions authorize normally. No shop parameter by itself creates a login.

The callback continues to verify Shopify HMAC, signed state/shop and expiry before exchange. HMACs of malformed lengths now reject rather than throwing. State additionally carries the configured OAuth origin, so even shared test credentials cannot move a staging state to production. Previously issued states lacking this origin must restart authorization after the code is released. No cookie or CSRF protection is relaxed.

Guided-start and failure redirects keep a validated shop recovery hint. The recovery screen supplies a top-level reconnect link; Check connection again starts authorization when a shop hint exists and login is missing or failed. It does not automatically loop on page load. Without a shop hint, the existing Shopify Admin link remains available. Login/session-store errors still prevent a successful redirect.

Trial grant/reinstall ledger, billing, webhooks, privacy and non-Shopify authentication logic are unchanged. An authenticated reopen bypasses all install/trial writes. OAuth reconnect continues to use the existing per-shop atomic claim and original trial dates.

## Exact configuration contract (staging app only)

The connected Railway app can expose variable names but redacts values. No Shopify Dashboard reader is available. Actual values/settings therefore remain unverified; these are the expected values to verify and correct only on **WhachatCRM Staging**:

| Setting | Expected value |
| --- | --- |
| Shopify Dev Dashboard app version: App URL | `https://whachatcrm-staging-app-staging.up.railway.app` |
| Shopify Dev Dashboard app version: Embed app in Shopify admin | **Off** (`embedded = false`) |
| Shopify Dev Dashboard app version: Allowed redirection URL | `https://whachatcrm-staging-app-staging.up.railway.app/api/shopify/callback` |
| Staging Railway `APP_URL` | `https://whachatcrm-staging-app-staging.up.railway.app` |
| Staging Railway `SHOPIFY_APP_HOST` | `https://whachatcrm-staging-app-staging.up.railway.app` |
| Staging Railway `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` | Credentials belonging to **WhachatCRM Staging**, never the production app |
| Staging Railway `NODE_ENV` | `production` (retains Secure cookies) |
| Staging Railway `SESSION_SECRET` | Existing staging-only persistent secret, stable across replicas/restarts |

The OAuth origin resolver now uses APP_URL or SHOPIFY_APP_HOST consistently instead of silently using the production callback when only SHOPIFY_APP_HOST is configured. It rejects a production callback on a Railway environment named staging. No existing production TOML, credentials or dashboard settings are modified. Keep Managed Pricing and compliance webhook settings as they are. If Dashboard embedding is currently enabled, turn it off on a staging version through the normal Dashboard release process; the SDK's non-embedded setting cannot change Dashboard configuration.

## Validation scope

Regression coverage includes real install/callback HTTP routes, browser handoff script execution in top-level/framed/blocked contexts, valid/invalid state, staging callback construction and state isolation, authenticated reopen, missing-session authorization and rendered reconnect action. Existing Passport/session-save, original-trial/reinstall, onboarding, webhook and contact-privacy tests supply the persistence and entitlement checks. Disposable PostgreSQL runs the three existing workflow test sequences; no live merchant/store/database is used.

No merge, deployment, app uninstall/reinstall or live OAuth test is performed. A successful live staging merchant connection remains a release check after reviewed code and staging-only Dashboard settings are applied. The user's live-test instruction was truncated, so no live OAuth action is authorized here.
