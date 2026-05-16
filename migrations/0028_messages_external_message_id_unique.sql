-- DB-level idempotency for provider inbound webhook retries.
-- Allows NULL external_message_id rows while preventing duplicate provider IDs per user.
CREATE UNIQUE INDEX IF NOT EXISTS messages_user_external_message_id_uq
  ON messages (user_id, external_message_id)
  WHERE external_message_id IS NOT NULL;
