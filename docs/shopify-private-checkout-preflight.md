# Private Shopify checkout preflight — 2026-10-25

## Production deployment and evidence

PR #190 passed Marketing Phase 1 and Sales Catalog CI and automated code review (no findings). It was squash-merged as `2d98f2a8529a3bd28fd98bde902d51b7d3914191`. Railway production deployment `8965ee07-5f9e-4c6e-a500-a107a96f6f3b` reached SUCCESS at 18:04:22 UTC; the service was online with one running replica, zero crashed replicas and zero issues. Staging was not changed.

The owner confirmed an existing **Whachat Crm Headless** storefront, created October 18, with existing public/private tokens and product/inventory reads and checkout read/write shown in Shopify Admin. This is owner-supplied configuration evidence, not a successful live Storefront probe.

Production inspection found no Storefront credential variable names in the application service and no Storefront configuration keys in the existing Shopify integration (keys were `shopUrl`, `syncOptions`, `shopifyLastInstalledAt`; no values/credentials were exported). The former accepted private session expired at 17:41:39 UTC. Do not extend it or treat its historical USD 749.95 / 50-unit proof as current checkout authorization.

## Restriction and supported resolution

The earlier PR #107 evidence records the **tokenless** Storefront path rejecting the development store with HTTP 400 / `BAD_REQUEST` / “Online Store channel is locked.” This occurs before variant fields resolve; it is not proof of an invalid product ID or insufficient inventory. The new diagnostic maps only that exact known error to a fixed category and never echoes provider text.

Shopify staff [documents using a Storefront token for password-protected development stores](https://community.shopify.dev/t/store-locked-error-when-fetching-storefront-api-on-the-server/23265/4). The [Storefront reference](https://shopify.dev/docs/api/storefront/2026-10) distinguishes public (`X-Shopify-Storefront-Access-Token`) and private server (`Shopify-Storefront-Private-Token`) headers. An Admin OAuth token is not a substitute. Token prefixes alone cannot establish API authority; the adapter explicitly refuses the installed Admin token and leaves actual Storefront authorization to Shopify.

Reuse the existing Headless token, channel and permissions. Keep password protection. Do not create/rotate/delete tokens, reinstall apps, add a storefront, modify grants or publish products during this read-only phase. [Headless permissions are shared across storefronts](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/manage-headless-channels), making speculative permission changes inappropriate.

A native cart and its Shopify-hosted `checkoutUrl` are supported by [cartCreate](https://shopify.dev/docs/api/storefront/2026-10/mutations/cartCreate). Shopify maps [checkout read/write scopes to Cart](https://shopify.dev/docs/api/usage/access-scopes). A successful product read cannot by itself prove mutation permission; do not send a dummy mutation as a supposed dry run. The approved single-cart test will be the first exercise of the write permission.

## Existing credential configuration, without sharing secrets

Use only the existing service's production Variables page:

[Railway production Lead-Flow-Manager](https://railway.com/project/2adeea49-431c-4ddf-8815-9ce89af66f32/service/a7b75139-5bf8-4a02-b4ab-b7d12e17e770?environmentId=fa2e8c30-72ea-4688-877f-4a68e24198bc).

| Service-only variable | Value |
| --- | --- |
| `SHOPIFY_STOREFRONT_TEST_TOKEN` | Existing Whachat Crm Headless private token, entered directly in Railway from Shopify or its existing secure storage |
| `SHOPIFY_STOREFRONT_TEST_TOKEN_KIND` | `private` |
| `SHOPIFY_STOREFRONT_TEST_SHOP` | `whachatcrm.myshopify.com` |

Do not paste a token into chat, GitHub, a URL, a client-side variable or the repository. Do not modify shared/staging variables or other settings. If the existing private token cannot be retrieved, the existing public Storefront token can be configured in the same server-only variable with KIND=`public`; no regeneration is needed. Partial configuration or another shop fails closed. No token is copied from another service or returned by the API.

In Shopify Admin, inspect **Products → The Collection Snowboard: Liquid → Publishing** for Headless eligibility without saving changes. Online Store publication does not prove Headless publication. The actual authenticated Storefront node query must return the exact variant; `variant_not_visible` is a failed eligibility check. If publication is absent, report it and review its impact before changing it.

## Adapter implemented for review

`POST /api/ai/test-chat/:id/checkout-preflight` accepts an empty JSON body only. The AI model, chat text, workflows and public channels cannot invoke it. The private UI exposes **Check checkout readiness** only after server diagnostics grant the exact marketing pilot.

The adapter requires ordinary workspace-admin authentication, Brain access, a real HTTP session, same-origin JSON, the fresh database owner/email and existing production pilot gates, and Shopping entitlement. It reads an owned/unexpired private session with an already selected variant in `confirming`; it rejects active turns, pending selection, invalid quantity and stale/foreign state. Product and variant GIDs come from the tenant-owned catalog mapping, quantity/price/currency/options from persisted state, never browser/LLM input.

It reuses `runValidation`, the existing owned Admin verification and existing Storefront provider's `verify`. This reattests development-store/app identity/grants, exact variant/product/options, publication, selected price/currency, inventory and quantity rules. After IO, it rechecks owner access, session, resolved selection, installation/Admin token identity and Storefront credential continuity. A returned proof must be at most 60 seconds old. Unknown tracked counts are not invented. Changes fail closed; a changed price requires re-verifying/acknowledging the selection through Shopping.

The existing `0112` setup/index check and shop-wide consumed-claim check are reused read-only. **No journal row, approval or dispatch claim is written.** There is no new cart/approve/create route. `runValidation` receives no approval, its claim/receipt callbacks throw, and the transport rejects any operation except the existing variant query. `cartCreationEnabled` and `cartCreated` are always false. Public rollout and private Shopping checkout settings remain off. No new infrastructure, schema or subscription is needed.

The response contains safe readiness fields, selected item, timestamped inventory and opaque scope digests, never an access token, cart ID or checkout URL. It is not an authorization token and cannot create a cart. The UI clears it on a new session/selection. Credentials/HTTP-session identity participate in the scope binding without being exposed. Provider failures use fixed diagnostic categories; there are no automatic action retries.

## Read-only acceptance and remaining blockers

1. Securely bind an existing Headless credential to the production application; report configuration status only.
2. In authenticated marketing AI Brain Test Chat, start a fresh session, discover Liquid, explicitly select the exact variant and quantity (initial cart candidate: one), then click **Check checkout readiness**. Refresh the selected price/inventory first if they changed.
3. Require real Admin **and authenticated Storefront** success for variant `gid://shopify/ProductVariant/51638769221914`, product `gid://shopify/Product/10108114174234`, with current price/currency, valid quantity rule and sufficient fresh inventory. Record timestamp and actual fields. Keep tokenless historical failure, owner configuration evidence and fixture successes separate from this provider result.
4. Review `operatorCartAccessConfigured` privately. Do not retarget the older admin-test allowlists just to make this true: doing so may expose its separate fixed-Hydrogen UI. No old Hydrogen approval is valid for Liquid. Before a private cart path is enabled, review an adapter that uses the existing durable journal and binds HTTP session + private session/selected-state + installation/credential + exact selection digest into its approval. No schema rebuild is required; existing legacy and private paths must share the same one-dispatch-per-shop fence.
5. The current runtime has only the **read-only** adapter. The narrowly approved mutation bridge and actual authenticated provider preflight must be completed before a controlled cart test. Existing unit/route fixtures do not close this provider gate.

## Exact prospective one-cart approval scope

Only after the preceding checks pass, present the fresh provider proof and bind approval to:

- Production workspace `6868785e-e8af-4152-8e2d-8d031c2e97d0` (`marketing@whachatcrm.com`), existing shop/production installation and Whachat Crm Headless credential.
- One authenticated authorized operator, its actual HTTP/private Test Chat sessions, unchanged persisted selection and an explicit short expiry.
- Exactly one Shopify `cartCreate`, exactly one line for Liquid / Default Title, product `10108114174234`, variant `51638769221914`, persisted approved quantity **one**. Fill in the **fresh** selected/verified price and currency; do not assume the earlier snapshot. Recheck live identity, price, quantity rules and inventory immediately before dispatch. Any mismatch stops the test.
- Autocommit the existing unique shop-wide dispatch claim before mutation. Double clicks, concurrent processes, session refreshes and new inventory timestamps must not create another cart. Ambiguous result, crash or lost response permanently consumes the claim; no automatic retries or reset/delete of the fence.
- Validate exact returned cart line/quantity/unit price/currency and Shopify-hosted checkout URL. Return the URL privately and ephemerally; no chat transcript/log/analytics persistence or messaging. Payment remains `unknown`. No buyer identity, discounts, addresses, checkout navigation, order, draft order, payment submission, invoice email, recovery or customer messaging is included. Any navigation/payment/order test needs its own explicit scope.

No cart approval is requested until fresh provider evidence is available. For later customer traffic, also review Shopify's trusted buyer-IP handling for private Storefront requests; this operator read-only diagnostic does not fabricate a buyer identity or IP.
