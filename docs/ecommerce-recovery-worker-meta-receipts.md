# Shopify checkout recovery staging worker & signed Meta receipt ledger

This milestone implements the **runtime path**, still DISABLED by default.

## Scheduler and permitted audience
A 90-second, single-process scheduler can perform one checkout recovery claim per
tick using the existing tenant-scoped PostgreSQL queue. An ambiguous Meta acceptance
or crash leaves the claim non-pending: **never automatically resend**.

The scheduler requires all of these exact staging-only, operator-configured inputs:
- RAILWAY_ENVIRONMENT_NAME=staging and staging APP_URL
- ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED=true
- ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED=true
- ECOMMERCE_RECOVERY_SEND_ENABLED=true
- ECOMMERCE_RECOVERY_WORKER_ENABLED=true
- ECOMMERCE_RECOVERY_WORKER_MODE=staging-test-only
- ECOMMERCE_RECOVERY_WORKER_ALLOWED_ACCOUNT_ID=<exact explicitly authorized staging test merchant>
- ECOMMERCE_WHATSAPP_RECOVERY_CONSENT_HMAC_KEY=an independently provisioned strong secret

**No values are set by this PR**. The new worker never runs in production and
cannot operate across all merchants. Importing code does not start it. It runs
only after explicit server bootstrap if the separate worker flag is true.

The worker reuses the existing actual Shopify fresh purchase/order check,
tenant-owned consent evidence and live Meta marketing-template approval. The
existing Meta sender independently locks the exact provider claim/consent/shop
and rechecks Shopify before its single send. All work is bounded by one claim
per tick, and a process crash cannot cause another automatic Meta send.

## Recovery delivery statuses
The existing signed X-Hub-Signature-256 Meta webhook now durably captures
Meta sent/delivered/read/failed receipts for recovery messages **before ACK**,
when ECOMMERCE_RECOVERY_RECEIPTS_ENABLED=true is configured on staging.

A status must match tenant, signed sender phone number ID, Meta provider message
ID, and the recipient's consent phone HMAC. Only an ACCEPTED outbox item can
record a receipt. Duplicate or out-of-order events do not overwrite READ/FAILED;
FAILED is terminal and does NOT requeue or send again.

The additive reviewed-only migration
migrations/20261020_ecommerce_recovery_meta_receipts.sql
adds receipt status/timestamp and a unique provider message ID per tenant.
Existing redaction of recovery outbox records deletes receipt metadata too.

## Deployment and launch restrictions
This PR does **not** run migrations, set flags, deploy staging, or enable a
real customer send. The pre-existing Shopify checkout observation, recovery
intent, WhatsApp consent, signed inbound evidence, delivery queue and this
receipt migration all require review and staged backup/restore before use.

Do not enable the worker until authorized test-shop ownership, approved
merchant-specific opt-in wording, current Meta marketing template, correct
recovery URL, Shopify purchasing and STOP test cases, accepted delivery receipts,
provider timeout reconciliation and privacy uninstall/redaction have been
verified end to end.

Known limitation: a Meta receipt arriving before the outbox transitions from
CLAIMED to ACCEPTED is not linked yet; it needs operator reconciliation rather
than a guessed retry. Production activation remains blocked. No marketing
claims should imply a live automated checkout recovery service.
