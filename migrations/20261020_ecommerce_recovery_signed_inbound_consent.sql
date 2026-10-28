-- Manual staging migration AFTER 20261020_ecommerce_whatsapp_recovery_delivery.sql
-- The source metadata is minimal and pseudonymous: no raw inbound text/phone.
-- Does NOT grant consent by itself; only the signed inbound hook may write it.
ALTER TABLE ecommerce_whatsapp_recovery_consents
  ADD COLUMN IF NOT EXISTS last_verified_inbound_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_verified_wamid VARCHAR(256);
CREATE INDEX IF NOT EXISTS ecommerce_recovery_consent_inbound_order_idx
  ON ecommerce_whatsapp_recovery_consents(account_id,shop,last_verified_inbound_at)
  WHERE last_verified_inbound_at IS NOT NULL;
