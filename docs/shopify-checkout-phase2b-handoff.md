# Phase 2B: tokenless checkout handoff, locked OFF

Reviewed October 16, 2026 (America/New_York). This supersedes PR A's proposed token-based rollout recommendation in `shopify-checkout-phase2b.md`. PR #95 is the base, production commit `985a8672e8ebc29fd975e5aa3da585804b8ca5c6`. The supplied workspace started at #94; restoring #95 through the GitHub connector produced exactly production tree `8c63d5ecfbc4c45095fa780a32bb7b07b9c515dc`.

## Verified authorization decision

Use Shopify's documented **tokenless Storefront API** for carts. Keep the existing owned Admin catalog/inventory access for the live quantity check. Do not provision a Storefront token for this implementation.

| Evidence | Verified fact | Consequence |
| --- | --- | --- |
| [Storefront API authentication](https://shopify.dev/docs/api/storefront/2026-10#authentication) | Tokenless access includes products and Cart read/write, with a 1,000 complexity limit. | No Storefront token, token header, Headless installation, or extra unauthenticated scope is needed for the chosen requests. |
| [ProductVariant](https://shopify.dev/docs/api/storefront/latest/objects/ProductVariant#field-ProductVariant.fields.quantityAvailable) and [scope reference](https://shopify.dev/docs/api/usage/access-scopes) | `quantityAvailable` requires token access and `unauthenticated_read_product_inventory`. | Tokenless verification omits that field. It requires a fresh owned Admin inventory result, no older than 60 seconds, sufficient quantity or verified untracked/continue-selling policy. This is not a workaround to obtain token-only data. |
| [cartCreate](https://shopify.dev/docs/api/storefront/2026-10/mutations/cartCreate) and [cart management](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/cart/manage) | Shopify returns the cart's actual `checkoutUrl`, lines, cost, errors and warnings. | Do not fabricate URLs, create draft orders, claim payment, or silently accept partial carts, warnings, changed prices or quantities. |
| [Storefront token creation](https://shopify.dev/docs/api/admin-graphql/2026-10/mutations/storefrontAccessTokenCreate) | The Admin mutation creates public Storefront access using delegated unauthenticated scopes. | This is an alternative API, not evidence that this particular app can provision it. No mutation is called. |
| [Scope declarations/grants](https://shopify.dev/docs/apps/build/authentication-authorization/app-installation/manage-access-scopes) | Declared scopes and installed grants differ; merchants approve permission changes. | Existing catalog permission flow remains authoritative. No app capability is inferred from a TOML declaration. |
| [App versions](https://shopify.dev/docs/apps/launch/deployment/deploy-app-versions) | App configuration changes are released as app versions, separately from backend deployment. | No CLI app deploy/version release is required or performed for the proposed tokenless scope configuration. |
| [Admin Shop](https://shopify.dev/docs/api/admin-graphql/2026-01/objects/Shop) | `myshopifyDomain` and `primaryDomain.host` identify the connected shop and its primary storefront domain. | Custom checkout URLs are accepted only after a fresh owned Admin query attests the exact host. This is host attestation, not permission to follow redirects or trust arbitrary Shopify-managed domains. |

Publication still matters. The catalog's existing ACTIVE/Online Store publication guards run first. The exact product/variant must also be visible and purchasable through the tokenless Storefront query. Publication in one channel is not assumed to prove another channel's visibility. Null nodes or mismatches fail closed. No publication is changed automatically. Required selling plans and component bundles remain unsupported.

**Verified repository configuration:** `shopify.app.whachatcrm.toml` identifies production client `e4585d4da1434c9e5649a2269e716076`, required `read_customers,read_orders`, optional `read_products,read_inventory`, managed install flow, webhook/Admin version 2026-01. The reference TOML has a different client ID. No TOML file was edited.

**Not verified:** the live Shopify Dev Dashboard, active app version/configuration, public-app distribution/capability approval, real installed scope grants, storefront publication, tokenless response schema against a real installation, real checkout-domain shapes, password-protected/development-store checkout behavior, and end-to-end buyer usability. There is no connected Shopify dashboard tool in this session. The repository is not evidence of those live facts. Official generic token APIs do not settle WhachatCRM-specific provisioning eligibility; app-managed token provisioning remains unimplemented rather than assumed.

## Exact Shopify configuration

For the selected tokenless approach: **no proposed TOML diff**. Retain:

```toml
[access_scopes]
scopes = "read_customers,read_orders"
optional_scopes = [ "read_products", "read_inventory" ]
use_legacy_install_flow = false
```

The merchant consents to the existing optional catalog permissions using existing settings. No new Storefront permissions, payment access, order-write access, billing system, or OAuth credential changes are introduced.

If a future decision chooses token-based provisioning instead, the candidate required scopes to review are `unauthenticated_read_product_listings`, `unauthenticated_read_product_inventory`, `unauthenticated_read_checkouts`, and `unauthenticated_write_checkouts`. Do not add them, request them as optional scopes to evade app capability checks, create tokens, or release a version without separately verifying the app/distribution model and consent requirements with Shopify. This is a contingency investigation list, not an approved configuration proposal.

## Implementation and security

- Checkout is gated by `CHECKOUT_ROLLOUT_APPROVED = false` in server source. Environment variables cannot enable it. Merchant checkout defaults OFF; HTTP settings reject enabling while the source gate is closed. The UI shows entitlement/connection/catalog/review status and a disabled enable control. No production settings have been changed.
- The owned Shopping Assistant callback runs inside its existing persisted latest-inbound/AI pause/contact pause/handoff/channel/lease guards. It validates Pro eligibility and merchant settings before dispatch and before returning a URL. Installation and selected product/variant are checked server-side. Confirmation receives the same fresh Admin verification as the shopping turn; it does not immediately repeat the API call into the catalog cooldown.
- The existing provider-neutral contract and PR #95 cart journal are reused. A durable confirmation identity survives repeated confirmations and retry turns. It starts from the persisted exact-selection event, so a lost final state commit cannot silently create another cart on a newer confirmation. Item changes/cancel/restart invalidate that identity. Inventory proof timestamps are excluded from the durable key. Installation identity includes a one-way digest of the existing Admin credential so reinstall/credential replacement invalidates receipts; the Admin token is neither changed nor sent to Storefront.
- All Storefront calls, including checks on reused receipts, share a durable per-owner/shop gate. Shopify throttling extends the cooldown. A journal claim precedes cart mutation; ambiguous completion/process death never triggers automatic mutation redispatch. Receipt TTL is 30 minutes, independent of Shopify cart lifetime. Expired/changed carts require human help or a deliberate new selection/confirmation; they are not recreated silently.
- Reuse rechecks current item, exact cart line/quantity/price/currency and returned checkout URL, then checks the latest turn and installation again. A superseding inbound, pause, handoff, settings change, entitlement loss or uninstall suppresses the old URL. A mutation may already have reached Shopify before a concurrent cancellation; the journal prevents redispatch but cannot undo a provider cart.
- Builder and AI Brain can read the same prepared inbound within the existing 60-second response lifetime. That exact-event replay decrypts the already verified, unexpired owned journal receipt after rechecking latest-inbound lease, entitlement, settings, source and installation; it makes no provider calls and records no duplicate activity. A newer customer event goes through normal live verification/reuse. Only a request hash and one-way installation identity join the safe state metadata; the URL remains encrypted.
- HTTPS URLs accept only exact connected `myshopify.com` or live Admin-attested primary host, approved cart/checkout paths, and the provider `key` parameter. No wildcard/suffix matching, browser allowlist, cross-shop URL, credentials, nondefault port, fragment, redirect parameter, or redirect probe. Other Shopify-managed checkout domains/URL formats remain blocked until independently attributable and reviewed.
- Checkout URLs/cart IDs are stored only in AES-256-GCM encrypted journal receipts, bound by AAD to the owned request. Ordinary shopping state, cached replies and activity events contain safe status only. The actual assistant reply can contain the genuine buyer checkout URL. It never contains an API credential and never asserts payment. No new sender or delivery route exists; Manual/Suggest/Auto and channel send deduplication remain in the existing reply pipeline.
- Tokenless authorization has **no new merchant credential to store, rotate, expose or revoke**. Existing Admin credential lifecycle remains unchanged. This deliberately avoids implementing an unnecessary token vault or manual token-copy UI. Uninstall and shop-redact purge checkout receipts/gates and turn the merchant checkout setting off under existing privacy fences; account/conversation deletion cascades receipt deletion. Existing Admin credentials/billing cleanup is untouched.
- Temporary failures retain the selected variant, quantity and confirmation identity. Replies offer retry/human help without implying stock reservation. Existing human-fallback setting applies to terminal checkout/setup failure. EN/ES/HE merchant and customer copy is included.
- Private Test Chat uses the same confirmation logic with an explicitly pure preview callback, no Shopify provider/cart capability and no fake URL. It creates neither customer contacts nor outbound customer messages. No real-cart test endpoint was needed or added. A future real integration test must be separately authorized, limited to an attested development store, and clearly labeled before creation.

## Review and activation blockers

This PR is for review only. No merge, deployment, Shopify release, live permission change, customer message, real cart, subscription or trial mutation was performed.

Before any later activation:

1. Review the tokenless design and live Shopify app configuration. Confirm the correct production app identity and existing catalog permissions; do not substitute the reference TOML.
2. Separately authorize and run one isolated development-store integration test through the provider, with no customer contacts/messages. Confirm the exact versioned tokenless query/cart schema, publication, quantity policy, checkout domain, store password constraints and successful buyer navigation. Fixture tests do not establish these facts. No live test path is exposed here.
3. Provision a random 32-byte receipt key as base64 in server-only `SHOPPING_CHECKOUT_RECEIPT_KEY`. It is absent from this PR/environment and has no default. Before rotating it, keep the rollout gate OFF and expire/purge outstanding encrypted receipts; do not redispatch old ambiguous confirmations. A multi-key decrypt/key-version migration is not implemented.
4. Apply existing `0110_checkout_preparation_attempts.sql` then new `0111_checkout_provider_gates.sql` through an approved database rollout. Neither runs in startup patches. These were applied only to disposable test schemas here.
5. Only after approval, change the server source gate in a separate reviewed activation change, deploy through the normal process, and let an entitled merchant explicitly enable the existing setting. No automatic broad merchant enablement.

Merchant setup after that approval: connect Shopify, activate Ecommerce Growth Engine/AI Brain with Pro access, authorize the existing catalog permissions, wait for catalog readiness, publish purchasable products in Shopify, and enable checkout assistance. No developer-created Storefront token, manual token copying, Headless setup, or separate billing setup is required by this implementation. Real-store restrictions may still require human assistance.

## Validation

See the PR description for exact final test counts, TypeScript comparison and remote CI status. Validation uses native disposable PostgreSQL 16; all Shopify calls in tests are fixtures. Build-generated hero images are excluded from the change. The production tree was reconstructed exactly for the local comparison because the shell's Git proxy was unavailable; GitHub publication uses the connector and the actual production parent SHA.
