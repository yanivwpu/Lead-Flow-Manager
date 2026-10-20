# Shopify abandoned-checkout observations — staging-only milestone

## Scope
This is a **read-only Shopify Admin GraphQL + internal PostgreSQL observation preview**.
It is **not** abandoned-cart recovery, customer messaging, an outbound send queue or
a new webhook subscription. A checkout is not abandoned merely because a checkout
webhook fired. Shopify's abandonedCheckouts query includes recovered purchases too.

## Safeguards
- Staging app hostname, environment and ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED=true
  are required. Default is disabled; production responds 404.
- Same-origin JSON merchant session and exact preview_sync payload, with optional
  bounded cursor; merchant cannot specify another tenant, shop, checkout or recipient.
- Merchant must have one current active Shopify installation and an access token;
  the SQL import rechecks ownership and the existing uninstall/privacy advisory lock.
- Shopify validates read_orders and manage_abandoned_checkouts authorization.
  Missing access/GraphQL errors fail closed. No extra scopes are requested here.
- Per invocation: one page, maximum 25 records, short network timeout, no bulk backfill.
  Shopify Admin API version follows the current staging app (2026-10).
- Only account/shop, Shopify AbandonedCheckout GID, updated timestamp, completed boolean,
  link-present boolean and next-review timestamp are stored. Customer names, contacts,
  tokens and recovery URLs are not saved or logged.
- Native PostgreSQL uniqueness handles concurrent duplicate pages. Shopify-completed
  checkouts become terminal, and later stale/incomplete observations cannot reopen them.
- Due reviews are **not** permission to send: next layer must re-fetch exact checkout
  status, verify consent and opt-outs, approved WhatsApp template/window and idempotent
  provider claim at send time.

## Migration/release
Manual, reviewed staging migration only:
migrations/20261020_ecommerce_abandoned_checkout_observations.sql
Never apply to production without independent backup/restore, privacy retention and
migration approval. CI tests isolated PostgreSQL 16, not deployed staging state.
Do not enable the flag before confirming migration and Shopify account permissions.

Route after staging deployment, merchant authentication and operator opt-in:
POST /api/shopify/ecommerce/checkout-observation-preview-sync
JSON {"action":"preview_sync"} or {"action":"preview_sync","after":"opaque cursor"}.
Output is metadata/counts only and messagingEnabled:false, recoveryEnabled:false.
No public merchant toggle is exposed by this milestone.

## Remaining work
1. Add bounded exact-checkout Admin rechecks by GID and purchase-time cancellation.
2. Prove staging merchant permissions and live GraphQL shape (including custom domains),
   test pagination and registration without requesting unnecessary customer data.
3. Build consent/opt-out/template and replay-safe provider outbox, with merchant opt-in.
4. End-to-end staging test (abandoned checkout, restored purchase, opt-out, duplicates,
   failed GraphQL, reinstall, privacy erasure) before any customer sends or marketing launch.
