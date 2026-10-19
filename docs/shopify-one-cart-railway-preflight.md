# Isolated Railway Shopify Admin preflight — operator checklist (no cart)

The staged service is `Shopify One-Cart Test PREP` (service ID `cd3e14a1-c6a1-4532-8c67-8bc502d5aa07`) in `WhachatCRM Shopify Staging/staging`. Current start command is **inert**. Do not deploy or change it to a cart command without separate approval.

## Minimum preflight-only inputs
- `CHECKOUT_TEST_PHASE=PREFLIGHT`.
- `CHECKOUT_TEST_RAILWAY_SERVICE_ID=cd3e14a1-c6a1-4532-8c67-8bc502d5aa07`.
- `CHECKOUT_TEST_READONLY_DATABASE_URL`: dedicated read-only PostgreSQL role, TLS as supported, SELECT-only access to the exact columns used by `resolveReadOnlyCheckoutInstallation`: `users.id`, `users.shopifyShop`, `users.shopifyAccessToken`, `users.shopifySubscriptionStatus`, `users.deletionRequestedAt` and `integrations.id`, `integrations.userId`, `integrations.type`, `integrations.isActive`, `integrations.config` (actual SQL names follow schema mapping); never point a writable production database credential here. The CLI also starts `BEGIN READ ONLY`.
- `SHOPIFY_CHECKOUT_DEV_STOREFRONT_PRIVATE_TOKEN`: private **Headless Storefront** token, entered only as a service-scoped Railway secret; not an Admin app key or Shopify Admin API token. Do not inherit shared production variables.
- For the existing `--preflight <file>` mode: a fixed selection JSON file with shop `whachatcrm.myshopify.com`, product `gid://shopify/Product/10108113912090`, variant `gid://shopify/ProductVariant/51638768632090`, quantity 1, valid owner `userId`, and the currently attested price/currency and exact selected options. The new `--bootstrap-preflight` mode derives that file privately from live Admin reads and takes no file argument.
- Persistent `shopify-one-cart-claim` volume staged at `/checkout-one-cart` (no volume use is required for a pure preflight, but guard verifies the mount).

Admin installation lookup **must** resolve the intended developer store, exact production app client ID `e4585d4da1434c9e5649a2269e716076`, developer-store plan, and read_products/read_inventory grants. Do not assume the existing staging app credentials or database point to that installation. If the correct installation does not exist in the isolated database, preflight cannot pass. Prefer an isolated read-only replica/approved least-privilege access to the owned installation rather than copying Admin tokens.

## Before any execution
1. GitHub PR checks green at its pinned commit, audit the script, persistent claim and private-output handling.
2. Confirm the service has the expected repo commit and no shared production secrets, app database writes, web domain, restart, cron or autoscale.
3. Use `--bootstrap-preflight` to derive the selection, or confirm an existing selection file has exact Admin-derived amount, currency, options and owner. Store it only on the isolated runtime; don't paste confidential values in chat.
4. For preflight, a separately approved start command must explicitly invoke `--bootstrap-preflight` or `--preflight <absolute-selection-file>` **without** an approval path. No Shopify cart mutation is executed by those modes.
5. Only after the preflight returns `preflight_passed` should a separate final approval with selection SHA and expiry be created. Production `CHECKOUT_ROLLOUT_APPROVED=false` remains unchanged.

## Read-only selection bootstrap (prepared, not executed)

On the dedicated service only, the operator command is:

```sh
node --import tsx scripts/validate-shopify-checkout.ts --bootstrap-preflight
```

This command accepts **no arguments or approval file**. It requires the attested service ID, `PREFLIGHT` phase and actual `/checkout-one-cart` mount before connecting to the read-only database. It does not start the application or any workers. Do not run it via the existing staging application. Configuring or deploying the inert service remains a separate operator approval; this change does neither.

The bootstrap discovers up to two matching owner IDs using only `users.id` and `users.shopifyShop`; zero or multiple matches fail closed, including duplicate inactive owners. It then reuses `resolveReadOnlyCheckoutInstallation` to read the existing restricted columns. Multiple active Shopify integrations, missing/invalid Admin or private Storefront credentials, and mismatched integration shops fail closed. No owner ID or token is printed.

Only `META` and `SHOPIFY_INVENTORY_BATCH_QUERY` are allowed on the fixed Admin `2026-01` endpoint. Inventory variables must contain only variant `51638768632090`. Exact live amount, currency and selected options form the selection for product `10108113912090`, quantity 1; there are no cached defaults. The existing `runValidation` runs without an approval and rechecks live app/shop/development plan/grants, publication, stock, selection and private Storefront variant verification. A second transport fence accepts only the provider's existing `CheckoutVariant` query and exact variant variables; any mutation, cart read or alternate endpoint is rejected before dispatch. Admin responses are never logged.

After successful verification only, the selection is saved exclusively as `/checkout-one-cart/private-claim/selection.private.json` (directory `0700`, file `0600`, fsync). Existing files, symlink directories and permissive directories fail closed. This file contains the owner identity and must remain on the private volume; do not export it or attach it to CI. Review/remove an old selection privately before any separately approved rerun. No cart claim or receipt is written. Standard output contains only `result` and `selectionSha256`; failure emits a fixed status and null digest, never an exception or provider payload. A failed run never yields a passing digest.

Successful output is live evidence only when this operator command actually executes against authorized credentials. Fixture tests and prepared source code are not live preflight evidence. Keep `CHECKOUT_TEST_PHASE=PREFLIGHT` and production `CHECKOUT_ROLLOUT_APPROVED=false`.

**Manual database step:** A database owner must create a dedicated LOGIN role with those column-level SELECT privileges and no INSERT/UPDATE/DELETE/schema permissions in the specific development-store installation database; grant connect/usage only as necessary. Enter its generated connection URL solely as `CHECKOUT_TEST_READONLY_DATABASE_URL` on the isolated new service after approval. A staging database without the correct active installation will not work. Never copy the production DB owner URL. Bootstrap discovers the unique owner internally; no owner ID needs to be supplied. No role or secret has been created in this PR.

