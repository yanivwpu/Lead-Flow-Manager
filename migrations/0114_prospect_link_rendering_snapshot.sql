-- Legacy authored snapshots retain their complete URL tokens. New drafts capture their mode and approved URL.
ALTER TABLE prospect_outreach_queue_items ADD COLUMN IF NOT EXISTS link_rendering_snapshot jsonb NOT NULL DEFAULT '{"campaignLinkUrl":"","preserveAuthoredUrls":true}'::jsonb;
