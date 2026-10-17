# Phase 2B checkout foundation (PR A)

Audit date: October 16, 2026. This is a disabled infrastructure foundation, not completion of the customer checkout acceptance criteria. No production installation, token, live scope grant, product publication, or checkout was inspected or changed. Findings about the installation below are repository findings, not claims about the live Shopify dashboard.

## Supported architecture and repository audit

Use the Storefront Cart API: `cartCreate(input: { lines: [{ merchandiseId, quantity }] })`, then return Shopify's `Cart.checkoutUrl`. Do not use the removed Checkout API, construct cart permalinks, create draft orders, or use app billing to collect buyer payment. Cart creation is not an order, reservation, or proof of payment.

Official references reviewed:

- [cartCreate](https://shopify.dev/docs/api/storefront/2026-10/mutations/cartCreate) and [cart management](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/cart/manage).
- [Storefront access and tokenless capabilities](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api). Tokenless read/write carts exist; a Storefront token is not a universal Shopify prerequisite. This foundation deliberately requires an explicit, separately authorized credential for the proposed token-based rollout.
- [Headless channel setup and tokens](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/manage-headless-channels).
- [Admin token provisioning](https://shopify.dev/docs/api/admin-graphql/2026-10/mutations/storefrontAccessTokenCreate) and [access scopes](https://shopify.dev/docs/api/usage/access-scopes).
- [API version policy](https://shopify.dev/docs/api/usage/versioning). The new client pins stable `2026-10` and rejects version fall-forward. Shopify currently lists accessibility through October 16, 2027; review quarterly. This does not change the existing Admin client's `2026-01` version or webhook configuration.
- [Development-store test checkout guidance](https://shopify.dev/docs/storefronts/mobile/build-mobile-storefront?extension=kotlin). Use a test payment gateway; do not interpret development-store password/payment restrictions as merchant checkout failures.

Existing `server/shopify.ts` uses an offline Admin token and `ApiVersion.January26`. Required install scopes are `read_customers,read_orders`. Production `shopify.app.whachatcrm.toml` declares optional `read_products,read_inventory`; catalog authorization asks for those separately. Staging currently declares no optional catalog scopes. Reference and production TOML files have different client IDs; do not deploy the reference config or infer dashboard identity from its filename.

`resolveCatalogInstallation` checks workspace user, active installation, connected shop, and active integration. Catalog sources bind to that integration. `verifyForPurchase` already handles live Admin inventory and source cooldowns. Phase 2A shopping selections persist local catalog IDs and confirmation in `conversations.shoppingState`; the shopping service serializes turns and honors channel/entitlement controls. Private Test Chat uses separate session storage. Existing activity endpoints project allowed state fields and exclude future cart secrets.

The catalog publication guard checks active, published **Online Store** products and rejects required selling plans. This is not proof of publication to Headless or another Storefront channel. The new Storefront variant query must independently return the same globally unique product/variant with matching options, purchasability, quantity, price, and currency. Null/inaccessible nodes fail closed. Bundles and required selling plans remain unsupported. Unknown Storefront quantity also fails closed, including stores that cannot expose that field.

No Storefront credential provisioning, encrypted checkout credential binding, or merchant checkout authorization is present in the existing runtime. The Admin token cannot simply be sent as a Storefront token. Live granted scopes and the app's Storefront capability remain unverified until an approved connected-store audit.

## Authorization decisions requiring review

Recommended first validation: merchant installs/manages the official Headless channel, creates a storefront, authorizes the necessary product/inventory/cart permissions, and publishes the selected products to that channel. Supply its private token server-side using `Shopify-Storefront-Private-Token`, bound to the already verified workspace/shop/installation. A public Storefront token is also supported via `X-Shopify-Storefront-Access-Token`; it is still handled server-side here. Do not request customer account access, payment scopes, or Admin write orders. Headless tokens do not require changing WhachatCRM's existing Admin OAuth scopes or releasing its app; they do require merchant action and new secure credential onboarding/storage, which this PR does not expose.

Alternative app-owned provisioning: review the unauthenticated Storefront scopes (`unauthenticated_read_product_listings`, `unauthenticated_read_product_inventory` for `quantityAvailable`, and cart/checkout access including `unauthenticated_write_checkouts` / read checkout access as required by the chosen token configuration). Verify the app's Storefront capability and sales-channel publication model in the Dev Dashboard. `storefrontAccessTokenCreate` delegates the app's granted unauthenticated scopes; it does not upgrade an Admin token. Do not assume optional scopes alone enable provisioning. Shopify staff document an app-level required-scope restriction in [this clarification](https://community.shopify.dev/t/access-denied-for-storefrontaccesstokencreate-field/32818/4); confirm with Shopify for this app before choosing this route. A required-scope change needs a reviewed TOML diff, correct app identity, Shopify CLI release, and merchant authorization/re-authorization. No such diff or release is included here.

Approval is required before either real token provisioning/publication changes or a genuine development-store cart. Do not run `shopify app deploy`, change live scopes, enable checkout, change subscriptions, or send customer messages as part of this PR. Shopify-managed app pricing, trials, and internal Pro entitlements are unrelated to buyer checkout and remain untouched.

## Implemented foundation

- Server-only, provider-neutral verify/prepare/optional-status contract. Payment status is always `unknown`.
- `checkoutEligibility` resolves a persisted, owned, recent explicit confirmation; rejects active shopping leases, wrong source/integration, changed options/price/currency, quantity errors and unavailable inventory; maps local IDs to provider IDs only after existing live verification. It does not accept client Shopify IDs or prices.
- Storefront HTTP adapter with separate public/private credentials, pinned version, timeout, redirect rejection, sanitized error codes, no automatic network retry, and throttle cooldown. Existing catalog verification retains its own shared quota/cooldown protection.
- `prepare` verifies the Storefront item immediately before `cartCreate`, and checks the actual returned cart's exact line, product, quantity and unit amount. Partial quantities, warnings, user errors, or changed prices never produce a customer link.
- HTTPS checkout URL validation accepts only the connected normalized `myshopify.com` host, a checkout/cart path and the provider's `key` parameter. No suffix/wildcard, caller allowlist, custom domain, userinfo, fragment or redirect parameter. Custom checkout domains and future Shopify URL shapes intentionally require another review; there is no follow-redirect probe.
- An operation journal, not a second cart database. The migration contains ownership foreign keys and cascade deletion; only an authenticated-encrypted receipt contains the provider cart ID/URL. No URLs or tokens enter ordinary activities or logs. The AES-256-GCM codec requires an explicitly supplied 32-byte secret and binds ciphertext to the request key. No hardcoded key or environment fallback.
- Existing `checkoutEnabled: z.literal(false)` remains unchanged. No checkout module is imported by a runtime route, AI Brain, Builder, Inbox sender, or Test Chat. The migration is not executed by startup patches. No deployed schema or production data was modified.

## Exact idempotency and failure guarantees

The SHA-256 key includes owner, conversation, source, installation, confirmation event, and exact item. A committed unique insert claims the operation **before** any provider call. Two processes using the same key cannot dispatch concurrently. A completed receipt is encrypted and reused for 30 minutes. An expired key is rejected; it is never silently deleted or dispatched again. A process crash leaves `preparing` blocked without lease stealing. A transport timeout, unknown error, malformed mutation result, partial mutation errors or uncertain completion becomes `ambiguous` and cannot automatically create another cart. Only explicit pre-execution throttling/authentication rejection allows a bounded retry after its cooldown. This trades recovery convenience for avoiding duplicate carts; it is not an exactly-once Shopify guarantee and cannot recover an orphaned cart after a lost response.

Local receipt TTL is an application reuse policy, not a Shopify promise of URL lifetime. `status` can read cart existence and return `expired`; it cannot establish payment. Before a future runtime reuses a receipt, it must recheck cart status, exact line/price and current selection. An unavailable cart needs a deliberate newly confirmed preparation, not automatic recreation of an ambiguous request. Repeated customer confirmations must retain the same durable confirmation identity in PR B; the current Phase 2A engine is unchanged and not wired to this journal.

## PR B and activation gates

Before adding any runtime call, implement and review:

1. Merchant-authorized encrypted credential setup/rotation/removal, verified installation binding, independently verified checkout domains if needed, clear setup status, Pro entitlements, and a default-OFF checkout setting.
2. Orchestration under the existing shopping turn ownership/lease fence, with settings, latest inbound, AI pause/handoff, consent, channel policy and installation checked before dispatch and again before publishing a receipt. `checkoutEligibility` alone is not a send authorization or concurrency fence. Preserve Manual/Suggest/Auto rules and existing send deduplication.
3. Stable confirmation identity and request reuse across repeated confirmations; checkout-ready/pending/changed/failed states; explicit renewal after material changes; cancel/quantity/variant changes; bounded durable store-wide provider quotas and cooldowns. Never send a stale receipt after a superseding inbound/cancellation. No automatic retries of ambiguous mutations.
4. Existing Inbox shopping activities with safe metadata, authorized link access and no secret cart tokens in event notes; EN/ES/HE copy and existing Builder action reuse.
5. Test Chat remains validation-only by default. A separate, explicitly approved, test-only operation must be scoped to an attested development store, visibly labeled, never create contacts/external messages, and never be available to the ordinary generator. This foundation does not add that operation or create a real cart.
6. Approved development-store integration test, provider-schema validation against the actual shop, then a separately approved merchant test. Neither has been performed here. Passing fixture tests do not establish live Shopify authorization or a usable buyer checkout.

The two-PR split is intentional: the authorization/publication path needs owner review, and cart mutation must remain unreachable while it is unresolved. Phase 2B acceptance criteria are still pending PR B and the approved live-provider tests.

## Validation recorded for PR A

- 52 tests passed in the combined checkout, Phase 2A shopping, private Test Chat, inventory, authorization and publication regression run. Database tests used an isolated native PostgreSQL 16 container via the existing `CATALOG_TEST_DATABASE_URL` fixtures, not a production database. The 9 provider tests were rerun successfully after adding Storefront minimum/maximum/increment validation.
- `npm run build` passed. Generated hero image changes were discarded.
- `TYPECHECK_BASE_SHA=e38d5018278594c2208e456937211b21ca6a5cdd node scripts/check-types-against-base.mjs` passed: base 97 diagnostics, candidate 97, added 0. Repository-wide TypeScript is not clean on main.
- Existing Sales Catalog CI now includes the new provider and PostgreSQL tests and migration path trigger. Remote CI results are reported separately on the PR.
- All Storefront responses in these tests are fixtures. No Shopify cart, order, payment, subscription, customer message or production write was performed.
