# Private cart execution diagnostics

The private execution source gate is **false** in this release. It must remain disabled while a previous shop-wide claim has an unknown outcome. Diagnostics do not authorize a new attempt, renew an approval or clear a fence. The existing request table, unique shop index, claim SQL and at-most-one mutation behavior are unchanged. No new schema or infrastructure is required.

## Supported reconciliation and limits

Shopify's [Storefront cart query](https://shopify.dev/docs/api/storefront/latest/queries/cart) retrieves one cart **by its ID**. The [cart guide](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/cart/manage) describes the full cart ID and secret key; treat these as credentials and never put them in logs or public reports. The [QueryRoot reference](https://shopify.dev/docs/api/storefront/latest/objects/QueryRoot) does not expose a cart search/list by merchant request UUID, app request UUID, product, or creation timestamp. Our internal preparation UUID is not a Shopify cart ID.

The [carts/create webhook](https://shopify.dev/docs/api/admin-rest/latest/resources/webhook) supports Online Store carts, not carts created in a custom storefront. Adding it cannot recover a past Headless operation. An absent order, abandoned checkout, webhook or inventory change is not proof that no Storefront cart exists.

Shopify documents the response `x-request-id` as useful for [support requests](https://shopify.dev/docs/api/hydrogen/latest/storefront-client/storefront-errors). If the original cart ID and Shopify response request ID were not retained, there is no documented self-service, read-only API to reconcile that operation solely from a shop and timestamp. A support investigation can be requested with the shop/app/time window, but its ability to recover the outcome is not guaranteed. Do not contact support, create a cart, guess a cart ID or repeat a mutation automatically. Unknown remains unknown until independently reconciled.

## Every post-claim HTTP 409 route

The durable claim commits **before** `provider.prepare`, which itself performs another verification before mutation. These are distinct boundaries.

| Post-claim point | Possible failure | Existing HTTP behavior |
| --- | --- | --- |
| Second Storefront verification in `prepare` | Transport/timeout, HTTP authorization/throttle/errors, API version/JSON/GraphQL errors, missing or invisible variant, identity/stock/quantity rules/bundle/selling-plan/options/price mismatch | `private_cart_failed_closed_do_not_retry` (409). Claim consumed; mutation may not have started. |
| Final mutation-boundary `unchanged` guard | Abort; approval expiry or digest change; turn lease, saved selection/quantity, installation or credentials changed; owner/session/entitlement/setup/database checks fail | The provider fetch wrapper converts the guard failure into a provider error, so the outer adapter returns generic 409. The diagnostic captures the original fixed guard reason before wrapping. `dispatchStarted=false`. |
| Mutation fetch invocation/response | Network loss, abort, timeout, redirects, 401/403/429 or other HTTP errors, API version/JSON/GraphQL/missing-data errors | Generic 409. `dispatchStarted=true` means invocation began, **not** that Shopify received or executed it. |
| `cartCreate` payload | Missing arrays/payload, `userErrors`, warnings, cart absent, or partial cart reported alongside errors | Generic 409. A reported cart can coexist with a rejected/unvalidated outcome; do not infer no cart. |
| Receipt validation | Missing/invalid cart ID, unsafe/unattested checkout URL, wrong line count/product/variant/quantity/price/currency | Generic 409. `cartReported` distinguishes a provider-reported cart from a validated receipt. |
| Final read-only status check | Fetch/authorization/response/receipt errors, expired/missing cart, identity/URL mismatch, unavailable status | Generic 409. `receiptValidated=true` records that a valid creation receipt was already seen. |
| Defensive missing receipt check | Validation path returns without assigning a receipt | `private_cart_failed_closed_do_not_retry` (409). |

`private_cart_aborted`, `private_cart_expired_changed_or_consumed`, `exact_liquid_quantity_one_required`, `turn_processing`, `selected_variant_required` and `checkout_installation_changed` can arise in guards; inside the mutation fetch they are wrapped as described above. Initial binding/selection checks and a duplicate/unique-index claim conflict are before **this invocation's** confirmed claim, not proof of a post-claim provider failure. An SQL claim request with an uncertain acknowledgement is logged as `claim=unknown`, never falsely as unclaimed. A process crash may produce no HTTP 409 or terminal event at all.

## Safe event contract

`[PrivateCartExecution]` events contain a generated attempt UUID; the syntactically validated request UUID after owner authorization; fixed stage/event/reason vocabulary; claim state (`not_attempted`, `unknown`, `committed`); and boolean dispatch/cart-report/receipt-validation milestones. Provider events add only the operation (`verify`, `create`, `status`), numeric HTTP status and a strictly validated Shopify response request ID. All provider bodies, error messages, GraphQL variables/messages, tokens, headers/cookies other than that validated request ID, customer fields, raw cart IDs and checkout URLs are excluded.

- `claim_committed` is emitted only after the standalone claim statement returns a row.
- `dispatch_started` is emitted after the final binding/abort checks, immediately before calling fetch. It is not a delivery acknowledgement.
- `provider_rejected` records a fixed category (HTTP access/throttle, GraphQL errors, cart user errors/warnings), never provider text.
- `cart_reported` means the response contained a cart-shaped identity; it does not mean receipt validation or payment succeeded.
- `receipt_validated` means the exact cart receipt passed the existing checks. The receipt stays in private memory; no URL/cart credential is logged.
- `status_available` and `execution_completed` distinguish final verification from an earlier receipt followed by status failure. No event establishes an order or payment.
- `execution_failed` retains the original bounded reason once; generic wrapping cannot overwrite it. Observer failures never authorize, retry or alter provider work.

Operational use is read-only: correlate by request/attempt UUID and timestamp, inspect the existing durable claim, and stop on uncertainty. Missing diagnostic events are not evidence of non-dispatch. Logs have normal platform retention and are not a substitute for the fence. Nothing in this release can reconstruct an earlier uninstrumented provider response or make a consumed request reusable.
