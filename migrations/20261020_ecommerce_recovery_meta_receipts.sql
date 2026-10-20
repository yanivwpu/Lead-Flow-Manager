-- Staging-only reviewed migration. Existing statuses remain unchanged.
-- Receipts are pseudonymous and never authorize another provider call.
ALTER TABLE ecommerce_checkout_recovery_outbox
 ADD COLUMN IF NOT EXISTS meta_delivery_status VARCHAR(16)
 CHECK(meta_delivery_status IN ('sent','delivered','read','failed'));
ALTER TABLE ecommerce_checkout_recovery_outbox
 ADD COLUMN IF NOT EXISTS meta_delivery_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS ecommerce_recovery_provider_receipt_unique
 ON ecommerce_checkout_recovery_outbox(account_id,provider_message_id)
 WHERE provider_message_id IS NOT NULL;
