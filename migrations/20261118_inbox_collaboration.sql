-- Additive shared Inbox send claims and expiring activity. No historical data rewrites.

CREATE TABLE IF NOT EXISTS inbox_send_attempts (
 id varchar(200) PRIMARY KEY, sequence bigserial NOT NULL,
 workspace_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 contact_id varchar NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
 conversation_id varchar REFERENCES conversations(id) ON DELETE SET NULL,
 actor_id varchar REFERENCES users(id) ON DELETE SET NULL,
 scope text NOT NULL, fingerprint text NOT NULL, state text NOT NULL DEFAULT 'reserved', result jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inbox_send_attempt_scope_idx ON inbox_send_attempts(workspace_id,scope,sequence);
CREATE UNIQUE INDEX IF NOT EXISTS inbox_send_active_scope_idx ON inbox_send_attempts(workspace_id,scope) WHERE state IN ('reserved','dispatching');
CREATE TABLE IF NOT EXISTS inbox_presence_sessions (
 id varchar PRIMARY KEY, workspace_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 actor_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE, room_id varchar NOT NULL,
 expires_at timestamptz NOT NULL, typing_until timestamptz
);
CREATE INDEX IF NOT EXISTS inbox_presence_room_idx ON inbox_presence_sessions(workspace_id,room_id,expires_at);
