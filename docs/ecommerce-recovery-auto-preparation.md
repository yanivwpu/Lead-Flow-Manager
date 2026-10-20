# Automatic Shopify checkout recovery preparation — staging-only

This milestone fills the previously missing automatic **Shopify observation → due checkout → fresh purchase recheck → signed WhatsApp consent + exact contact match → unique outbox enqueue** segment.

The orchestration is bounded: first Shopify page (25 checkouts) and at most 3 due checkouts per 90-second tick for **one named staging test merchant**. The source may report additional pages; this version does not silently claim comprehensive scanning and a cursor strategy will be required for high volume.

It does NOT call Meta or send customer messages. Sending is controlled separately by the recovery worker flag, consent, current template and real purchase rechecks.

## Independent activation gates (OFF by default)
- RAILWAY_ENVIRONMENT_NAME=staging, exact staging APP_URL
- ECOMMERCE_CHECKOUT_OBSERVATION_ENABLED=true
- ECOMMERCE_CHECKOUT_RECOVERY_PREP_ENABLED=true
- ECOMMERCE_RECOVERY_AUTOPREP_ENABLED=true
- ECOMMERCE_RECOVERY_WORKER_MODE=staging-test-only
- ECOMMERCE_RECOVERY_WORKER_ALLOWED_ACCOUNT_ID=explicit staging test merchant
- ECOMMERCE_RECOVERY_TEMPLATE_NAME=the exact, locally approved Meta MARKETING template name
- ECOMMERCE_WHATSAPP_RECOVERY_CONSENT_HMAC_KEY=separately provisioned strong shared consent digest key

On each tick the runtime checks current active Shopify installation, one shop-linked integration, current Meta connection and tenant ownership; serialized privacy locks protect signed Shopify uninstall/redaction and consent capture.
No email/SMS Shopify marketing consent is accepted. An unambiguous phone/Shopify customer match, current recipient HMAC, signed WhatsApp inbound event evidence and tenant-owned approved marketing template are required.

A completed purchase updates the observation and suppresses both prepared intents and any pending outbound entry. Later Meta worker sends independently recheck Shopify + consent again. Unknown Shopify permission failures do not enqueue anything.

## Staging readiness and migrations
Latest source merge is not proof that these additive tables were applied. Existing Railway variables are missing all recovery activation flags. As of this work the last known successful staging build was PR #145.

Migrations must be reviewed, backed up and applied **in order**, only on the authorized staging PostgreSQL:
1. 20261020_ecommerce_abandoned_checkout_observations.sql
2. 20261020_ecommerce_checkout_recovery_intents.sql
3. 20261020_ecommerce_whatsapp_recovery_delivery.sql
4. 20261020_ecommerce_recovery_signed_inbound_consent.sql
5. 20261020_ecommerce_recovery_meta_receipts.sql

The Railway connector here provides deployment/variable inspection but no authenticated SQL migration execution capability. Do NOT claim migration success without a real connection and schema check.

Confirm Shopify read_orders and manage_abandoned_checkouts permissions with the real development store. Review the merchant-branded WhatsApp opt-in notice and approved marketing template before any test sends. Record purchase-before-send, STOP, signed webhook receipt, duplicate replay, uninstall and customer/redact acceptance results. Do NOT set ECOMMERCE_RECOVERY_SEND_ENABLED or ECOMMERCE_RECOVERY_WORKER_ENABLED until separately authorized and those tests pass.

## Known limitations
The Shopify source uses only the newest 25 checkouts per tick; a real pagination/cursor and work budget are needed for high-volume/production.
The opt-in contact mapping currently depends on a correctly merged, E.164 formatted WhatsApp and Shopify customer contact. Mismatches fail closed.
No production or multi-merchant enablement, automated migrations, or marketing launch in this PR.
