-- Phase 1 automation: flow job safety, no-reply jobs, timer jobs, send dedup
-- Apply on Neon/Railway before deploying code that references these columns.

-- flow_jobs: stuck recovery + stop-on-reply + fail retries + skipped terminal state
ALTER TABLE flow_jobs ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
ALTER TABLE flow_jobs ADD COLUMN IF NOT EXISTS snapshot_last_inbound_at TIMESTAMPTZ;
ALTER TABLE flow_jobs ADD COLUMN IF NOT EXISTS stuck_recoveries INTEGER NOT NULL DEFAULT 0;
ALTER TABLE flow_jobs ADD COLUMN IF NOT EXISTS fail_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE flow_jobs ADD COLUMN IF NOT EXISTS max_fail_retries INTEGER NOT NULL DEFAULT 3;

-- no_reply durable scheduling
CREATE TABLE IF NOT EXISTS no_reply_jobs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workflow_id VARCHAR NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  contact_id VARCHAR NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id VARCHAR,
  chat_id VARCHAR,
  run_at TIMESTAMPTZ NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'pending',
  idempotency_key TEXT NOT NULL UNIQUE,
  anchor_outbound_at TIMESTAMPTZ NOT NULL,
  snapshot_last_inbound_at TIMESTAMPTZ,
  scheduled_reason TEXT,
  stuck_recoveries INTEGER NOT NULL DEFAULT 0,
  fail_count INTEGER NOT NULL DEFAULT 0,
  max_fail_retries INTEGER NOT NULL DEFAULT 3,
  locked_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_no_reply_jobs_pending_run
  ON no_reply_jobs (status, run_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_no_reply_jobs_contact
  ON no_reply_jobs (contact_id, status);

-- W2 / routing durable timers
CREATE TABLE IF NOT EXISTS automation_timer_jobs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  run_at TIMESTAMPTZ NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'pending',
  dedup_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  snapshot_last_inbound_at TIMESTAMPTZ,
  stuck_recoveries INTEGER NOT NULL DEFAULT 0,
  fail_count INTEGER NOT NULL DEFAULT 0,
  max_fail_retries INTEGER NOT NULL DEFAULT 3,
  locked_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_timer_pending_run
  ON automation_timer_jobs (status, run_at)
  WHERE status = 'pending';

-- Send idempotency (short-lived keys; optional periodic cleanup)
CREATE TABLE IF NOT EXISTS automation_send_dedup (
  dedup_key TEXT PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  contact_id VARCHAR,
  status TEXT NOT NULL DEFAULT 'locked',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_send_dedup_created
  ON automation_send_dedup (created_at);
