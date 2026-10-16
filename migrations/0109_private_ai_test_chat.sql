-- Internal-only AI transcripts. No foreign keys to customer CRM or delivery queues.
CREATE TABLE IF NOT EXISTS ai_test_sessions (
 id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 actor_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 transcript jsonb NOT NULL DEFAULT '[]'::jsonb,
 shopping_state jsonb NOT NULL DEFAULT '{}'::jsonb,
 expires_at timestamp NOT NULL,
 lease_token text,
 lease_until timestamp,
 last_turn_at timestamp,
 UNIQUE(user_id, actor_id)
);
