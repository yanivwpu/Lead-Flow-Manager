# Phase 2: internal Shopify order-created support task outbox (staging only)

This PR prepares the first automatic **internal merchant support task** from a
verified `orders/create` event. It does NOT create a customer-facing workflow
or place a task on the existing general Follow-Ups calendar. That integration
remains a later, separately reviewed step.

## Fail-closed release boundary

- Requires exact Railway staging environment **and** exact staging APP_URL.
- Requires two independent operator flags:
  `ECOMMERCE_EVENT_RECORDING_ENABLED=true` and
  `ECOMMERCE_ORDER_SUPPORT_TASKS_ENABLED=true`. Both default OFF.
- Requires a separately persisted, per-account and per-shop
  `ecommerce_growth_order_task_settings.tasks_enabled = TRUE` opt-in.
  **Workflow drafts (PR #115) do not satisfy this opt-in.**
- No settings row exists by default and this PR provides no opt-in endpoint:
  deployments cannot create tasks until a later reviewed merchant activation UI.
- Only the existing HMAC-verified Shopify order-create route can call the queue
  after unique active installation resolution, commerce ingest, and event insert.
- Atomic SQL verifies exact tenant, canonical shop, delivery ID, `orders/create`
  topic, `pending` inbox state, and contact ownership again.
- A unique event FK prevents retries/concurrent webhook copies creating multiple tasks.
  Task records contain only event ID, account/shop, CRM contact ID, state and times.
  Contact deletion cascades to the task; it contains no customer payload.
- No Shopify mutations, emails, WhatsApp/SMS/other sends, legacy automation calls,
  order fulfillment/cancellation workflows or checkout/cart activity.
- No historic/backfilled event processing. The user's existing pending order
  event is left untouched. Recording and manual event review remain separate.

## Validation and follow-ups

1. Run pure guard tests and the PostgreSQL concurrency/tenant test under isolated
   `SHOPIFY_TEST_DATABASE_URL` in Shopify CI. Review the migration.
2. Read-only verify staging database identity and backup/rollback options.
3. Apply additive migration to **staging only** after explicit release acceptance.
4. Deploy with both flags OFF; confirm order/customer ingestion, uninstall/privacy,
   and existing review queue have no regression.
5. Implement an authenticated merchant task opt-in/pause UI; define how per-shop
   settings are revoked on uninstall and shop-redact before enabling the operator
   task flag. This PR intentionally does not auto-enable from draft preparation.
6. Only then enable a bounded new-event test; no extra real order or messaging test
   without explicit approval. Add a merchant task listing/completion flow and
   general Follow-Ups integration in separately gated reviews.

This change alone is **not** a completed merchant-facing automation feature.
