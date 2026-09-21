-- Link each immutable recommendation version to the exact first-party snapshot it used.
ALTER TABLE seo_action_versions ADD COLUMN IF NOT EXISTS page_snapshot_id varchar REFERENCES seo_page_snapshots(id);
CREATE INDEX IF NOT EXISTS seo_action_versions_page_snapshot_idx ON seo_action_versions(page_snapshot_id);
