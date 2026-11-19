// Receipt keys enforce uniqueness for NEW deliveries; historical messages remain untouched.
export const INBOUND_DEDUP_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS inbound_message_receipts (
 user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 channel text NOT NULL,
 external_message_id text NOT NULL,
 claim_token uuid,
 lease_until timestamptz,
 message_id varchar REFERENCES messages(id) ON DELETE SET NULL,
 PRIMARY KEY(user_id,channel,external_message_id)
);
CREATE INDEX IF NOT EXISTS messages_user_external_message_lookup_idx
 ON messages(user_id,external_message_id) WHERE external_message_id IS NOT NULL;
`;
