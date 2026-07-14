-- Prospect Intelligence outreach lifecycle (separate from review_status)
-- approved stays on review_status; outreach tracks not_sent → outreach_sent → replied
ALTER TABLE prospect_intelligence
  ADD COLUMN IF NOT EXISTS outreach_status text NOT NULL DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS outreach_sent_at timestamp,
  ADD COLUMN IF NOT EXISTS outreach_conversation_id varchar,
  ADD COLUMN IF NOT EXISTS outreach_message_id varchar,
  ADD COLUMN IF NOT EXISTS replied_at timestamp;

CREATE INDEX IF NOT EXISTS prospect_intelligence_outreach_conversation_idx
  ON prospect_intelligence (outreach_conversation_id)
  WHERE outreach_conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS prospect_intelligence_outreach_status_idx
  ON prospect_intelligence (outreach_status);

CREATE INDEX IF NOT EXISTS prospect_intelligence_review_status_idx
  ON prospect_intelligence (review_status);
