# E-Commerce delivery schema: production-copy preflight (2026-10-30)

## Purpose and status

**PASS — isolated production-copy migration rehearsal. NOT APPLIED TO PRODUCTION.**
Merchant Shopify account and previously verified YES/STOP/YES-again WhatsApp consent flow
were NOT re-created or re-tested. This only validates schema integration.

Production Neon project: `fancy-truth-71283112`, branch `production`
(`br-lucky-salad-anatrtle`). Read-only baseline inspection established existing
`ecommerce_abandoned_checkout_observations`, `ecommerce_checkout_recovery_intents`,
and `ecommerce_growth_event_inbox`.

New isolated copy: `ecommerce-delivery-schema-preflight-20261030`
(`br-quiet-rain-angxv4bl`), created from the production branch at HEAD; no
production DDL, flags, Shopify/Meta calls, order creation, customer messages,
or test consent were performed.

## Existing migrations reused, strictly in order

1. `migrations/20261020_ecommerce_whatsapp_recovery_delivery.sql`
2. `migrations/20261020_ecommerce_recovery_signed_inbound_consent.sql`
3. `migrations/20261020_ecommerce_recovery_meta_receipts.sql`
4. `migrations/20261028_ecommerce_recovery_provider_attempt.sql`
5. `migrations/20261030_ecommerce_post_purchase_intents.sql`

14 SQL statements executed transactionally on the isolated branch without error.
No `DROP`, `DELETE`, backfill, replay or privilege changes. All five recovery
attempt/receipt/consent columns present after migration.

Isolated branch postflight: ALL TRUE — observation, recovery intent,
recovery consent, recovery outbox, post-purchase orders, post-purchase intents,
post-purchase consents, strict recovery runtime column readiness.

Production postflight (read-only): observation and recovery intents TRUE;
recovery consent/outbox and three post-purchase tables FALSE; recovery readiness
FALSE. Therefore **production message preparation and delivery still OFF**.

## Deployment / migration sequence for later, separately authorized release

- Verify exact production connection (project/branch/database) and runtime
  environment; capture fresh backup or reversible branch/snapshot before
  any write. Preserve the audit evidence already collected.
- Apply the five existing migrations in the tested order, with normal change
  control; reject unexpected drift / pre-existing columns or incompatible
  constraints rather than silently drop/recreate. Record applied hashes.
- Run the already-shipped read-only
  `recoveryRuntimeSchemaReadyQuery()` and `postPurchaseTablesQuery`.
  Expect all required objects and columns to be present before preparing any
  queued work.
- Keep both independent recovery and post-purchase send/worker gates OFF.
  No synthetic YES, no automatic consent grant, no old checkout replay.
- Review live Shopify subscription scopes/registrations, Meta WABA/approved
  template status, purpose-specific consent and identity binding separately.
- Only after an approved merchant-scoped production delivery implementation,
  verify one explicitly authorized recipient and signed Meta receipt, then
  purchase/STOP/uninstall/duplicate suppression and restart-safe uncertainty.
- For rollback: disable workers and revert application version; preserve
  outbox/intent and STOP tombstones for reconciliation. Do NOT drop or
  replay tables, recycle uncertain attempts, or send from the test branch.

## Shopify webhook audit finding

Current production startup reported `whachatcrm.myshopify.com` as
`Verification Unavailable`, `missingRequired=0`, `blockedByScope=0`.
The existing `docs/shopify-webhook-health.md` and
`server/shopifyWebhookHealthAudit.ts` explicitly distinguish unknown
app-level compliance subscription evidence from known missing registrations.
That single summary is NOT proof of a broken order webhook or any granted
permission. Use the existing **read-only** merchant diagnostic and Shopify
Partner Dashboard app-level status to resolve; do not blindly re-register.
The fulfilled/cancelled subscriptions for #230 need distinct confirmation
from existing live app configuration before runtime activation.

## Message templates

The existing `/api/templates` library is the source for custom merchant
content. A selected local template cannot send on its own: purpose-specific
consent, supported format, current Shopify identity/status, local + live Meta
approved category/language/body matching, and a durable at-most-once provider
attempt are still mandatory. A selected template is no-send configuration.
