# Phase 1B production Shopify catalog activation

## Correction to PR #84

Shopify's server rejected the Phase 1B upload with **“Missing scope for webhook topic”** for all ten product, inventory and collection topics. Local TOML schema validation did not establish that Shopify would accept those subscriptions with optional scopes. They must not be app-managed in this configuration.

`shopify.app.whachatcrm.toml` keeps `read_products` and `read_inventory` **optional**. Required scopes remain `read_customers,read_orders` in both TOML and server `SHOPIFY_SCOPES`; `use_legacy_install_flow = false` stays unchanged. The correction removes only those ten webhook declarations. The final TOML has **seven** subscriptions: existing customer create/update, order create, three privacy subscriptions, and `app/scopes_update`. OAuth, Managed Pricing, app identity and per-shop uninstall handling remain unchanged. No staging/reference configuration is changed.

Use `--config whachatcrm`: production client ID **`e4585d4da1434c9e5649a2269e716076`**, origin `https://app.whachatcrm.com`, callback `https://app.whachatcrm.com/api/shopify/callback`, webhook API **2026-01**. Do not select the separate reference `shopify.app.toml`. The owner reported the active production version as `whachatcrm-9`; this is not independently verified by local tests.

## Shop-specific subscriptions after consent

Shopify supports shop-specific subscriptions through Admin GraphQL [`webhookSubscriptionCreate`](https://shopify.dev/docs/api/admin-graphql/2026-01/mutations/webhookSubscriptionCreate), using the installed shop's token and granted topic scopes. Unlike app-managed TOML subscriptions, they are registered separately for each consenting installation. App-managed subscriptions are not returned by the shop-specific subscription query: keep an explicit ownership manifest and never create parallel subscriptions for those topics. See [subscription configuration](https://shopify.dev/docs/apps/build/webhooks/subscribe).

The existing leased catalog worker now reuses `registerVerifiedShopWebhooks`, its actual-grant verification, read-before-create and callback read-back checks. The SDK and webhook payload version remain **2026-01**. Catalog topics from the [versioned enum](https://shopify.dev/docs/api/admin-graphql/2026-01/enums/WebhookSubscriptionTopic) map to the existing signed handlers:

| Topic | GraphQL enum | Callback suffix | Worker requires |
| --- | --- | --- | --- |
| `products/create` | `PRODUCTS_CREATE` | `products-create` | `read_products` |
| `products/update` | `PRODUCTS_UPDATE` | `products-update` | `read_products` |
| `products/delete` | `PRODUCTS_DELETE` | `products-delete` | `read_products` |
| `inventory_items/update` | `INVENTORY_ITEMS_UPDATE` | `inventory_items-update` | `read_products` |
| `inventory_levels/update` | `INVENTORY_LEVELS_UPDATE` | `inventory_levels-update` | `read_inventory` |
| `inventory_levels/connect` | `INVENTORY_LEVELS_CONNECT` | `inventory_levels-connect` | `read_inventory` |
| `inventory_levels/disconnect` | `INVENTORY_LEVELS_DISCONNECT` | `inventory_levels-disconnect` | `read_inventory` |
| `collections/create` | `COLLECTIONS_CREATE` | `collections-create` | `read_products` |
| `collections/update` | `COLLECTIONS_UPDATE` | `collections-update` | `read_products` |
| `collections/delete` | `COLLECTIONS_DELETE` | `collections-delete` | `read_products` |

Each callback starts with `https://app.whachatcrm.com/api/shopify/catalog-webhooks/`. Slashes become hyphens; underscores stay unchanged. Inventory-item subscriptions can also be authorized by `read_inventory`, but this product catalog worker requires `read_products` to run. Product update events cover variant changes. Existing signed handlers verify raw-body HMAC, shop ownership and deduplication, then queue bounded targeted product/variant refreshes; collection changes use existing bounded membership refreshes. Reads do not trigger messages, campaigns or workflows.

Registration is one topic per durable worker chunk, serialized under the existing source lease. The source/user/integration/shop/token and active installation are verified before requests and under the shop advisory lock across each bounded mutation. Callback origins come from the existing server `HOST`, not webhook/browser input. Actual provider grants are checked again before create. Unknown grants, conflicting callbacks, duplicate subscriptions or incomplete listings fail closed; nothing is deleted. A lost create response/read-back retries by listing first, so an already-created subscription is reused.

Each initial/read-back scan is capped at two pages of 50. SDK retries are disabled for this path; existing ten-second request bounds, throttle observations and source continuation delays limit work. Failure retries after five minutes; successful cycles recheck subscriptions after 24 hours and repair missing ones without forcing another catalog import. Scope-set changes reset the registration cycle. Readiness reports pending/retrying/partial/verified registration separately from catalog availability. If an installation has more than 100 app-owned shop-specific subscriptions or conflicting callbacks, operator review is required; registration does not scan without bound or delete existing subscriptions.

Registration metadata lives in the existing durable source checkpoint and survives full/import/event checkpoints; no schema migration is needed. Existing generation-safe pruning, installation ownership, incremental queues, error retries, merchant recovery limits and configurable daily/size-aware full reconciliation remain intact. Registration failure does not prevent the subsequent polling recovery pass. Permission-restricted stores can operate with partial webhook coverage and reconciliation; do not claim verified inventory events without the actual grant and subscription read-back. No live subscriptions are created during this PR or its fixture tests.

## Owner commands after merging — create an unreleased version only

The correction includes server changes as well as configuration. Merge and deploy the reviewed server correction through a **separately approved** deployment before merchant activation; neither deployment nor merge is performed by this task. Keep `SHOPIFY_CATALOG_AUTH_ENABLED` disabled throughout preparation.

From the merged checkout on the owner's authenticated workstation:

```sh
shopify auth login
shopify app config validate --config whachatcrm
shopify app deploy --config whachatcrm --version phase-1b-catalog-activation-v2 --no-release
```

Login is only needed if not already authenticated. Confirm the client ID above. This uploads an **unreleased** candidate; do not reuse the rejected candidate name. Inspect the server-validated diff: two optional scopes, seven subscriptions, no product/inventory/collection TOML subscriptions, unchanged required scopes/OAuth/billing/privacy and unrelated settings/extensions. Stop on unexpected removals or scope changes; do not use force/deletion flags. Local CLI schemas and CI cannot substitute for this authenticated Shopify server validation. No upload or release is performed in this correction.

## Later activation sequence — requires separate approval

1. Review the exact unreleased candidate and deploy the reviewed server correction through approved production operations. Confirm the callback host, signing credentials and API version. Keep the authorization gate disabled until the corrected candidate is approved and released.
2. Only after explicit release approval, the owner may run:

   ```sh
   shopify app release --config whachatcrm --version phase-1b-catalog-activation-v2
   ```

   Verify the active version and seven app-managed subscriptions in Shopify's Dev Dashboard. This command does not deploy the WhachatCRM server.
3. Separately approve enabling `SHOPIFY_CATALOG_AUTH_ENABLED` through normal production operations. Do not change `SHOPIFY_SCOPES`. This task makes no Railway variable changes.
4. A consenting merchant opens **Sales Catalog → Shopify Products → Approve Product Access**. The existing authenticated `/api/shopify/catalog/authorize` route resolves their owned installation and redirects the top-level browser to:

   ```text
   https://admin.shopify.com/store/{STORE_NAME}/oauth/install?client_id=e4585d4da1434c9e5649a2269e716076&optional_scopes=read_products,read_inventory
   ```

   Shopify asks the merchant to approve the optional read access. App opening and TOML declaration alone do not grant permissions; no reinstall or required-scope OAuth expansion is needed. The merchant can decline while retaining existing access and billing. No merchant is reauthorized in this task.
5. Return to `/app/sales-catalog?source=shopify`. The signed app-managed `app/scopes_update` wakes an existing source; **Retry Sync** also queues work under the existing one-per-minute recovery/backoff limits. The worker verifies actual installation scopes and performs bounded shop-specific registration before import chunks. Missing `read_inventory` leaves inventory-level subscriptions skipped and readiness partial. Never infer grants from a browser return or webhook alone.
6. Inspect `catalogWebhooks` readiness and the shop-specific GraphQL subscription list for the ten granted catalog topics and exact callbacks; use the Dev Dashboard for the seven app-managed subscriptions. With an explicitly approved test/pilot shop, verify signed product/variant/inventory/collection changes trigger targeted refresh, customer/order/privacy processing remains intact, and daily reconciliation recovers missed events. Confirm initial import and current inventory before declaring products ready. Registration confirmation is not proof of successful event delivery.

No app version is published, no authorization gate is enabled, and no merchant grants or production records are modified by preparing this correction.

## Optional-access return correction

The standalone optional-scope request above returns through the app URL, rather than the normal OAuth code callback. It must not run installation provisioning or subscription onboarding. The catalog authorization route now verifies the owned installation's actual grants before asking for consent: if both optional scopes are already granted, it repairs stale catalog metadata and queues the existing worker without asking again.

When consent is needed, the route saves a 15-minute server-session intent bound to the initiating actor, workspace, canonical shop, integration and a token fingerprint before leaving for Shopify. On the app-URL return, normal bootstrap reaches `/api/shopify/install`; a matching existing session routes to `/api/shopify/catalog/return` instead of `/shopify/start`. The return rechecks the current installation and actual Admin API grants, updates only the owned catalog source, consumes the intent and returns to `/app/sales-catalog?source=shopify`. Declined scopes return to the same page with verified missing-permission state. Browser/query claims never grant access. Expired launch intents are consumed and return to Sales Catalog without making provider calls; missing/mismatched return sessions or replaced tokens fail closed; API verification failure leaves a valid intent available to retry. Other app opens and new installations retain existing onboarding behavior.

This path does not exchange a token, recreate an integration/workspace, claim/reset a trial, synchronize billing, grant paid access or send mail/messages. It preserves worker checkpoints, generation and leases, as well as quota/API-error delays. Successful permission verification does not declare products imported or inventory fresh.

Production middleware now captures exact raw bytes for both `/api/shopify/webhooks/*` and `/api/shopify/catalog-webhooks/*` before global parsing. Catalog handlers still require a valid HMAC and installation ownership; no signature check is bypassed. Signed `app/scopes_update` only queues a verified worker check, never copies payload scopes into authorization state. Subscription declarations/registration and optional/required scopes are unchanged by this correction.

### Incident evidence and safe verification

Read-only inspection during investigation found the test source already `ready`, with all four scopes, a completed initial import of 17 products, and successful read-back registration of all ten catalog topics. The completion time was 2026-10-15T06:08:54.699Z. Earlier permission-required state was therefore stale. Request logs showed the approval return traversing `/` → `/api/shopify/install` → `/shopify/start`, while scope-update deliveries returned 401 and no catalog events were persisted. Existing polling recovery completed the import despite the rejected event.

That source snapshot records the worker's successful provider verification; it is not a new live API check. When shell credentials/network access are unavailable, an owner already signed in to the correct merchant can make the existing **read-only** request:

```text
GET https://app.whachatcrm.com/api/shopify/webhooks/health
```

Check that `report.permissionVerification` is `verified` and `report.grantedScopes` includes `read_products` plus `read_inventory`. A verification-unavailable result is unknown, not evidence that Shopify denied approval. This endpoint does not register subscriptions. Share only verification status and granted scope names, never tokens or cookies. Do not request another approval, force an import or change billing to resolve a previously stale snapshot. After separately approved deployment, test the optional-access return with an expired-trial fixture/test merchant and confirm unchanged trial, billing and workspace records.
