# Phase 1B production Shopify catalog configuration

This PR prepares configuration only, on top of merged PR #83 (`cdc9a5e2b8d688801e69aa23033362103995e914`). It does not publish an app version, enable `SHOPIFY_CATALOG_AUTH_ENABLED`, change production hosting, or authorize a merchant.

## Production target and preserved behavior

Use **`shopify.app.whachatcrm.toml`**, selected by `--config whachatcrm`. It targets production client ID **`e4585d4da1434c9e5649a2269e716076`** at `https://app.whachatcrm.com`. Do not select the staging app or the separate reference `shopify.app.toml`.

Required scopes remain `read_customers,read_orders` in both TOML and server `SHOPIFY_SCOPES`. The existing `use_legacy_install_flow = false` supports Shopify-managed optional scope requests, so no required-scope expansion is needed. The OAuth callback remains `https://app.whachatcrm.com/api/shopify/callback`. Managed Pricing, original customer/order subscriptions, three privacy subscriptions, and per-shop uninstall registration retain their existing behavior. No billing or runtime code is changed.

The only scope addition is:

```toml
optional_scopes = [ "read_products", "read_inventory" ]
```

Declaring optional scopes does **not** grant them to existing installations or force approval on ordinary app opening. Grants change only after an explicit dynamic request and merchant consent. See Shopify's [managed scope documentation](https://shopify.dev/docs/apps/build/authentication-authorization/manage-access-scopes).

## Versioned catalog topics and callbacks

The webhook payload API version stays **2026-01**, matching Phase 1B. All eleven topics below are available in Shopify's [2026-01 topic enum](https://shopify.dev/docs/api/admin-graphql/2026-01/enums/WebhookSubscriptionTopic) and [2026-01 TOML webhook reference](https://shopify.dev/docs/api/webhooks/2026-01?reference=toml). They match the deployed `SHOPIFY_CATALOG_TOPICS` allowlist exactly.

All catalog URLs start with `https://app.whachatcrm.com/api/shopify/catalog-webhooks/`:

| Topic | Callback suffix | Grant required |
| --- | --- | --- |
| `app/scopes_update` | `app-scopes_update` | Existing app installation |
| `products/create` | `products-create` | `read_products` |
| `products/update` | `products-update` | `read_products` |
| `products/delete` | `products-delete` | `read_products` |
| `inventory_items/update` | `inventory_items-update` | `read_products` or `read_inventory` |
| `inventory_levels/update` | `inventory_levels-update` | `read_inventory` |
| `inventory_levels/connect` | `inventory_levels-connect` | `read_inventory` |
| `inventory_levels/disconnect` | `inventory_levels-disconnect` | `read_inventory` |
| `collections/create` | `collections-create` | `read_products` |
| `collections/update` | `collections-update` | `read_products` |
| `collections/delete` | `collections-delete` | `read_products` |

Suffixes replace **slashes only**, preserving underscores, as the existing signed handler requires. Product update events cover variant changes. Collection events cover manual membership/rule changes; attribute-driven automatic membership changes still need the bounded recovery policy in Phase 1B. No location, payment, checkout, marketing, write or publication-specific scopes/topics are added.

These are app-managed subscriptions. Keep existing per-shop uninstall handling; do not create duplicate per-shop catalog subscriptions. The final TOML has **17 subscriptions: six existing plus eleven catalog**. Actual delivery is conditional on the installation's granted access; declarations alone are not proof of delivery or catalog readiness.

## Validation performed and release prerequisite

- Python TOML/config tests verify exact production identity, unchanged required scopes/install mode/OAuth, all original callbacks, privacy subscription ownership, absence of duplicates, and parity with the deployed catalog topics/scopes. Staging tests remain unchanged and pass.
- Shopify CLI **4.9.4** bundled local app-loader schemas validate this production TOML successfully: 17 subscriptions and the two expected optional scopes. This check uses the CLI's local schema path without loading remote app settings.
- The normal `shopify app config validate --config whachatcrm --no-input --json` command was attempted but could not complete its linked-app authentication lookup: `accounts.shopify.com` was unreachable (`EAI_AGAIN`). No account login, app release or merchant authorization was completed. Local schema checks and CI do not substitute for the authenticated owner validation immediately before release.
- Existing catalog authorization/recovery/signed-webhook, OAuth, Managed Pricing, webhook health/registration and customer-privacy fixture tests pass. CI also runs the existing production/staging config and Shopify regression checks.

## Exact activation sequence — future operator actions only

Do not run the publishing or authorization steps as part of preparing this PR. Each release/runtime/merchant step below requires the later approval requested by the owner.

1. Review and approve this configuration PR and its CI, then merge it through the normal approved process. Keep the authorization flag disabled. Phase 1B web handlers must already be deployed, as reported for PR #83.
2. On an authenticated owner's workstation, select this checkout and validate the named production configuration:

   ```sh
   shopify app config validate --config whachatcrm
   ```

   Confirm the production client ID above. Complete any Shopify app-review/access requirements before proceeding. Preserve existing Managed Pricing plans and customer-data approvals.
3. Only after release preparation is approved, create an **unreleased** version:

   ```sh
   shopify app deploy --config whachatcrm --version phase-1b-catalog-activation --no-release
   ```

   This uploads a version but does not activate it for merchants. Review its complete diff in Shopify: two optional scopes, eleven new catalog callbacks, unchanged six original callbacks, required scopes, OAuth, app identity, API version and existing extensions/billing. Stop if the diff removes or alters unrelated settings; do not use deletion/force flags.
4. Only after that exact version is approved for publication, release it:

   ```sh
   shopify app release --config whachatcrm --version phase-1b-catalog-activation
   ```

   Verify the active production version and configured catalog callbacks in the Dev Dashboard. These CLI operations publish Shopify configuration; they do not deploy the WhachatCRM web server. No such operation was performed in this PR. See [deploy](https://shopify.dev/docs/api/shopify-cli/app/app-deploy) and [release](https://shopify.dev/docs/api/shopify-cli/app/app-release).
5. Separately approve runtime activation, then set `SHOPIFY_CATALOG_AUTH_ENABLED=true` through existing production operations and apply the required process restart. Do not change `SHOPIFY_SCOPES`. This is a later operator action, not a change in this PR.
6. An explicitly consenting existing merchant opens **Sales Catalog → Shopify Products → Approve Product Access**. The existing authenticated route `/api/shopify/catalog/authorize` resolves their owned installation, ensures its catalog source, and redirects the top-level browser to:

   ```text
   https://admin.shopify.com/store/{STORE_NAME}/oauth/install?client_id=e4585d4da1434c9e5649a2269e716076&optional_scopes=read_products,read_inventory
   ```

   Shopify asks that merchant to approve the additional read access. They can decline without uninstalling or changing their current customer/order access, billing or plan. The declared optional scopes are not appended to the original required-scope OAuth request. The original OAuth callback stays available for its existing installation flow.
7. After consent, return to `/app/sales-catalog?source=shopify`. `app/scopes_update` wakes the existing source; **Retry Sync** also queues recovery. Existing quota/error backoff, distributed leases and the one-request-per-minute limit still apply. The worker verifies actual `currentAppInstallation.accessScopes` through the installed token; do not infer access from the TOML, browser return or webhook alone. If either requested scope is missing or the installed token cannot read the provider, keep the blocked/limited state and resolve it before claiming full inventory capability.
8. Allow initial bounded import to complete, then verify readiness, actual products/variants and current inventory snapshots. With an explicitly approved test shop or pilot, verify signed product/inventory/collection delivery, tenant ownership, incremental price/stock refresh and preserved customer/order/privacy processing. Use the Dev Dashboard for app-managed subscriptions/delivery; do not rely solely on the per-shop GraphQL subscription list. No customer messages or campaigns should be triggered. Catalog ready requires a successful import, not just OAuth connection or consent.

No merchant has been reauthorized during preparation. No published settings, environment flags, production records or subscriptions were mutated.
