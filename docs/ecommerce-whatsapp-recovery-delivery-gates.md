# Checkout recovery WhatsApp consent + delivery safety — release boundary

Status: **not live, not scheduled, and NO customer sends**. This is a reviewed
engineering foundation only. Do not interpret a queued record as approved
consent or provider authorization.

## Implemented in this PR
- Exact Shopify abandoned-checkout customer identity is checked against the
  associated Abandonment customer. Missing, anonymous or mismatched IDs block.
- Explicit **WhatsApp checkout-recovery opt-in evidence**, scoped to the
  tenant/shop/contact/Shopify customer and the current normalized E.164 phone
  HMAC, is required. Shopify email/SMS marketing consent and imported phone
  numbers do not count. An opt-out, DNC, paused automations, changed recipient,
  expired proof or missing provenance blocks.
- Both tenant-owned local template status and current live Meta template
  status must be **APPROVED/MARKETING**, exact name + locale.
- Additive consent evidence + recovery outbox schema. At most one outbox item
  per checkout/intent; PostgreSQL claim is atomic with SKIP LOCKED. There is
  **no automatic retry after a provider attempt with unknown acceptance**.
  Reconcile uncertain claims manually against Meta provider receipts.
- The unscheduled, dependency-injected delivery core checks installation,
  Shopify current purchase status, consent and live template immediately
  before its sole provider callback. No existing API, cron, event, template
  sender or background worker calls this function.
- A new Shopify completed-purchase observation suppresses an unsent outbox
  item as well as the existing internal review intent.

## Hard blockers to any live customer sending
1. An audited **WhatsApp-specific** opt-in capture and revocation flow must
   create/revoke the consent evidence. There is **NO public/merchant setter**
   and no automatic inference from Shopify. The evidence table will be empty.
   Consent updates need protected source and tenant/phone association.
2. Confirm merchant WhatsApp connected, approved Meta MARKETING template and
   correct parameter/button construction; wire a reviewed adapter to the
   existing Meta template sender. The adapter does **not** exist in this PR.
3. Build a scheduled worker/cron with operator monitoring and a provider
   acceptance reconciliation mechanism. The execution core is not scheduled
   or exported as an active HTTP endpoint. Uncertain/claimed entries never
   retry automatically.
4. Complete GDPR/shop-redact/customer-redact/uninstall deletion and suppression
   integration for both new tables (including recipient HMACs and consent
   metadata) and verify against real staging PostgreSQL.
5. Apply the 3 migrations in order to an authorized backed-up staging database,
   check ownership and scoped tenant identities, prove real Shopify API
   permissions and Meta template status, and exercise the end-to-end journey.
   This PR does not run migrations.
6. Full Meta/Shopify provider proof, recipient opt-out, delivery receipts,
   duplicate-event, late purchase, uninstalled shop, and timeout acceptance
   scenarios must be accepted before release.
7. The existing staged operator switches alone do NOT authorize sends.
   The separate ECOMMERCE_RECOVERY_SEND_ENABLED staging-only guard is also
   unset by default and must remain unset until all gates are met. Production
   is hard blocked regardless of environment variable settings.

Migration: migrations/20261020_ecommerce_whatsapp_recovery_delivery.sql.
It deliberately has no customer phone or URL, but still stores pseudonymous
contact IDs, Shopify IDs and HMACs. Privacy deletion and retention review
are mandatory before any application.

Design preference: one merchant-facing "Turn on recovery" action only after
these readiness checks pass. Keep advanced details collapsed.
