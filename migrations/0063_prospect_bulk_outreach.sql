-- Phase 2: Controlled multi-channel AI prospect outreach queue
-- REVIEW / OUTREACH LIFECYCLE / QUEUE EXECUTION stay as separate concepts.

CREATE TABLE IF NOT EXISTS prospect_outreach_settings (
  workspace_user_id varchar PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  preferred_channel text NOT NULL DEFAULT 'auto',
  daily_send_limit integer NOT NULL DEFAULT 40,
  hourly_send_limit integer NOT NULL DEFAULT 12,
  min_delay_seconds integer NOT NULL DEFAULT 90,
  max_delay_seconds integer NOT NULL DEFAULT 180,
  queue_running boolean NOT NULL DEFAULT false,
  paused boolean NOT NULL DEFAULT false,
  updated_at timestamp DEFAULT now(),
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prospect_bulk_analysis_jobs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  initiated_by_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  contact_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  selection_mode text NOT NULL DEFAULT 'selected',
  force_reanalyze boolean NOT NULL DEFAULT false,
  progress_current integer DEFAULT 0,
  progress_total integer DEFAULT 0,
  result_completed integer DEFAULT 0,
  result_needs_review integer DEFAULT 0,
  result_failed integer DEFAULT 0,
  result_skipped integer DEFAULT 0,
  error_message text,
  created_at timestamp DEFAULT now(),
  started_at timestamp,
  completed_at timestamp
);

CREATE INDEX IF NOT EXISTS prospect_bulk_analysis_jobs_workspace_idx
  ON prospect_bulk_analysis_jobs (workspace_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS prospect_outreach_batches (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'queued',
  preferred_channel text NOT NULL DEFAULT 'auto',
  selected_count integer NOT NULL DEFAULT 0,
  queued_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  skip_summary jsonb DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now(),
  started_at timestamp,
  completed_at timestamp
);

CREATE INDEX IF NOT EXISTS prospect_outreach_batches_workspace_idx
  ON prospect_outreach_batches (workspace_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS prospect_outreach_queue_items (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id varchar NOT NULL REFERENCES prospect_outreach_batches(id) ON DELETE CASCADE,
  workspace_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id varchar NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  selected_channel text NOT NULL,
  sender_mailbox_id varchar,
  recipient_identity text NOT NULL,
  recipient_identity_normalized text NOT NULL,
  subject_snapshot text,
  message_snapshot text NOT NULL,
  recommended_offer text,
  outreach_angle text,
  queue_status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  last_error text,
  dedup_key text NOT NULL,
  sequence_step integer NOT NULL DEFAULT 1,
  scheduled_at timestamp,
  started_at timestamp,
  sent_at timestamp,
  conversation_id varchar,
  message_id varchar,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS prospect_outreach_queue_active_dedup_uidx
  ON prospect_outreach_queue_items (workspace_user_id, dedup_key)
  WHERE queue_status IN ('queued', 'sending', 'paused', 'failed');

CREATE INDEX IF NOT EXISTS prospect_outreach_queue_due_idx
  ON prospect_outreach_queue_items (queue_status, scheduled_at)
  WHERE queue_status = 'queued';

CREATE INDEX IF NOT EXISTS prospect_outreach_queue_workspace_status_idx
  ON prospect_outreach_queue_items (workspace_user_id, queue_status);

CREATE INDEX IF NOT EXISTS prospect_outreach_queue_contact_idx
  ON prospect_outreach_queue_items (contact_id);

CREATE INDEX IF NOT EXISTS prospect_outreach_queue_batch_idx
  ON prospect_outreach_queue_items (batch_id);
