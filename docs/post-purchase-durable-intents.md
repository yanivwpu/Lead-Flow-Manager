# Post-purchase webhook → durable intent milestone

Stacked on draft #226, which is stacked on #225. Both existing drafts and their green CI were inspected before coding. Their six-plan editor, workflow-draft endpoint, localization and pure timing/suppression policy remain the source of merchant configuration. Existing live checkout/order/template/YES/STOP tests were not repeated.

## Implemented runtime

- Existing raw-body Shopify HMAC handler now supports `orders/create`, `orders/fulfilled`, `orders/cancelled`. Creation retains existing CRM/order ingestion and internal support behavior, then calls the new preparation service. Fulfillment and cancellation endpoints use the same signature/header/verified-bytes validator; retryable failures return 503 before acknowledgment.
- Fresh, bounded, read-only Shopify Admin query verifies the exact order/customer, cancellation/fulfillment status and latest customer purchase. Missing guest/customer/protected-data/API evidence fails closed. Full-order fulfillment is supported; partial shipment/delivery notifications are not inferred.
- The existing payload-free event inbox and classifier are reused. Order state plus intents commit atomically with inbox linkage under the existing shop privacy advisory lock. A unique `(account, shop, order, journey)` constraint deduplicates retries even when Shopify sends a different delivery ID. The database also binds intent order/customer/installation identity by a composite foreign key.
- A bounded preparation timer reopens persisted due rows after restart, claims them under the same shop/row locks and rereads current merchant plans, CRM identity, consent, local/live templates and Shopify order status. Replica races serialize in PostgreSQL. Failures retry internal preparation only; there is no customer-provider attempt.
- Cancellation/fulfillment status changes invalidate stale confirmations/shipping/review work. New purchases suppress older marketing intents. STOP and uninstall terminally suppress work; terminal rows cannot be revived by replay, pause/resume or reinstall. Customer/shop redaction purges pseudonymous records even when preparation is off, including unmerged STOP tombstones matched by the signed erasure phone. A missing HMAC key with unbound tombstones blocks acknowledgment rather than silently claiming erasure. Contact/user/installation deletion uses foreign-key cleanup. Existing Shopify customer erasure fences prevent repopulation.

## Purpose-specific consent and templates

The existing recovery ledger has a hard `purpose='checkout_recovery'` constraint and cannot store these grants without changing already-accepted checkout semantics. An additive six-purpose ledger therefore stores only the new purpose evidence. It reuses the existing verified Meta inbound boundary, signature/raw-body/freshness validator, phone HMAC, exact CRM/WhatsApp identity and suppression eligibility. Checkout consent and generic YES cannot authorize these journeys.

The new signed-inbound hook accepts only the six explicit channel-and-purpose phrases exported by `POST_PURCHASE_CONSENT_PHRASES`; STOP/UNSUBSCRIBE revokes all six. STOP creates tombstones for never-granted purposes as well, so a delayed older first grant cannot bypass it. A new grant after STOP restores only that one purpose. No merchant API can synthesize a grant. A merchant-specific notice and genuine recipient opt-in remain release prerequisites; no customer was contacted here.

Each journey must bind an existing tenant-owned library template ID through the reviewed configuration key `ecommercePostPurchaseTemplates[journey]`. No template is auto-chosen, created, submitted or approved. Local and live Meta name/language/category/body must match. Utility categories are required for confirmation/fulfillment/cancellation; review/repeat/win-back conservatively require marketing. Only supported body-text templates (optional order variable `{{1}}`) can become preview-ready; no sending/rendering adapter is included. Missing binding or eligibility leaves a durable blocked intent with reason codes. The editor/activation state from #226 remains disabled for delivery.

## Development and release boundary

No send function, send flag, outbound outbox or delivery worker is used by this runtime. `preview_ready` is a no-send readiness snapshot, not authorization or an at-most-once delivery claim. If delivery is implemented later it needs its own durable attempt fence, fresh consent/status/template rechecks and receipt handling; it must never consume a stale readiness snapshot directly.

Preparation requires all of:

- `RAILWAY_ENVIRONMENT_NAME=staging`
- the exact existing staging `APP_URL`
- `ECOMMERCE_POST_PURCHASE_PREP_ENABLED=true`
- a single explicit `ECOMMERCE_POST_PURCHASE_ACCOUNT_ID`
- active, uniquely owned Shopify installation with installation timestamp, saved journey selection and reviewed schema

Defaults are OFF, production is rejected, and no configuration was changed. STOP revocation for the pinned workspace still runs with preparation paused. A missing schema while explicitly enabled returns a retryable error; normal existing operation is unaffected while disabled.

The new SQL migration is review-only, additive and NOT registered in startup migration/bootstrap. Applying it anywhere beyond isolated test databases requires separate review/authorization and the existing backup/rollback process. Rollback disables preparation and rolls back application code; preserve durable dedupe/suppression rows rather than clearing them to replay orders.

No Shopify subscriptions/TOML/scopes or production settings changed. The code handles real deliveries at `/api/shopify/webhooks/orders-fulfilled` and `/api/shopify/webhooks/orders-cancelled`; approved subscription configuration and protected customer data/read-order permissions must be verified before enabling preparation. Older win-back orders may additionally require Shopify `read_all_orders` access. No new test orders, checkouts, sends, deployments or merges occurred.

## Remaining blockers

Reviewed migration and staging-only rollout/subscription acceptance; self-service template binding and purpose-specific consent notices; live read-only acceptance on existing orders without creating test orders; and a separately authorized delivery/receipt milestone. Existing #226 merchant pilot availability rules are preserved. This milestone implements webhook ingestion, durable no-send intent preparation and eligibility; it does not activate customer messaging.

## Validation

Focused new tests cover signed fulfillment/cancellation boundaries, strict identity, read-only Admin checks, durable delay/restart, fresh status/template/plan changes, semantic duplicates, transaction crash rollback/retry, purpose isolation, STOP before first grant, privacy/uninstall, and cross-order purchase suppression. Existing recovery eligibility/consent tests protect the extracted shared validation. The same intent suite uses native PostgreSQL in foundation CI, including concurrent delivery dedupe and uninstall-versus-preparation races; local runs use isolated PGlite when no loopback test PostgreSQL is configured.
