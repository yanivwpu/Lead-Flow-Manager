-- Superseded by 0113 receipt keys: legacy duplicates must not make bootstrap fail.
-- Keep any already-installed unique index; do not rewrite or delete historical rows.
CREATE INDEX IF NOT EXISTS messages_user_external_message_lookup_idx
 ON messages(user_id,external_message_id) WHERE external_message_id IS NOT NULL;
