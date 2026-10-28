-- Review-only. A committed fence must precede any provider request; rollback,
-- process crashes and duplicate adapter callers must never permit another send.
ALTER TABLE ecommerce_checkout_recovery_outbox
  ADD COLUMN IF NOT EXISTS provider_attempted_at TIMESTAMPTZ;
