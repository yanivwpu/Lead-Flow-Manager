# Isolated Railway Shopify Admin preflight — operator checklist (no cart)

The staged service is `Shopify One-Cart Test PREP` (service ID `cd3e14a1-c6a1-4532-8c67-8bc502d5aa07`) in `WhachatCRM Shopify Staging/staging`. Current start command is **inert**. Do not deploy or change it to a cart command without separate approval.

## Minimum preflight-only inputs
- `CHECKOUT_TEST_PHASE=PREFLIGHT`.
- `CHECKOUT_TEST_RAILWAY_SERVICE_ID=cd3e14a1-c6a1-4532-8c67-8bc502d5aa07`.
- `CHECKOUT_TEST_READONLY_DATABASE_URL`: dedicated read-only PostgreSQL role, TLS as supported, SELECT-only access to the exact columns used by `resolveReadOnlyCheckoutInstallation`: `users.id`, `users.shopifyShop`, `users.shopifyAccessToken`, `users.shopifySubscriptionStatus`, `users.deletionRequestedAt` and `integrations.id`, `integrations.userId`, `integrations.type`, `integrations.isActive`, `integrations.config` (actual SQL names follow schema mapping); never point a writable production database credential here. The CLI also starts `BEGIN READ ONLY`.
- `SHOPIFY_CHECKOUT_DEV_STOREFRONT_PRIVATE_TOKEN`: private **Headless Storefront** token, entered only as a service-scoped Railway secret; not an Admin app key or Shopify Admin API token. Do not inherit shared production variables.
- Fixed selection JSON file with shop `whachatcrm.myshopify.com`, product `gid://shopify/Product/10108113912090`, variant `gid://shopify/ProductVariant/51638768632090`, quantity 1, valid owner `userId`, and the currently attested price/currency and exact selected options. The CLI reads this from a file, not from Railway variable JSON.
- Persistent `shopify-one-cart-claim` volume staged at `/checkout-one-cart` (no volume use is required for a pure preflight, but guard verifies the mount).

Admin installation lookup **must** resolve the intended developer store, exact production app client ID `e4585d4da1434c9e5649a2269e716076`, developer-store plan, and read_products/read_inventory grants. Do not assume the existing staging app credentials or database point to that installation. If the correct installation does not exist in the isolated database, preflight cannot pass. Prefer an isolated read-only replica/approved least-privilege access to the owned installation rather than copying Admin tokens.

## Before any execution
1. GitHub PR checks green at its pinned commit, audit the script, persistent claim and private-output handling.
2. Confirm the service has the expected repo commit and no shared production secrets, app database writes, web domain, restart, cron or autoscale.
3. Confirm the selection file has exact Admin-derived amount, currency, options and owner, and store it only on the isolated runtime; don't paste confidential values in chat.
4. For preflight, start command must explicitly invoke `--preflight <absolute-selection-file>` **without** an approval path. No Shopify cart mutation is executed by that mode.
5. Only after the preflight returns `preflight_passed` should a separate final approval with selection SHA and expiry be created. Production `CHECKOUT_ROLLOUT_APPROVED=false` remains unchanged.

**Caution:** the current CLI does not derive its selection JSON automatically from Admin. The existing admin-only route can derive live price/options but requires a controlled app installation, migrations, test operator allowlists and session. No price should be represented as fresh Admin-verified until such an attested read is actually performed.

**Manual database step:** A database owner must create a dedicated LOGIN role with those column-level SELECT privileges and no INSERT/UPDATE/DELETE/schema permissions in the specific development-store installation database; grant connect/usage only as necessary. Enter its generated connection URL solely as `CHECKOUT_TEST_READONLY_DATABASE_URL` on the isolated new service after approval. A staging database without the correct active installation will not work. Never copy the production DB owner URL. The owner/workspace ID is also needed to produce the selection file. No role or secret has been created in this PR.
