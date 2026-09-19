CREATE TABLE IF NOT EXISTS seo_search_snapshots (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(), property_id text NOT NULL DEFAULT '__legacy_unscoped__', reporting_date date NOT NULL,
  query text NOT NULL, page text NOT NULL, clicks double precision NOT NULL DEFAULT 0,
  impressions double precision NOT NULL DEFAULT 0, ctr double precision NOT NULL DEFAULT 0,
  position double precision NOT NULL DEFAULT 0, imported_at timestamp NOT NULL DEFAULT now()
);
ALTER TABLE seo_search_snapshots ADD COLUMN IF NOT EXISTS property_id text NOT NULL DEFAULT '__legacy_unscoped__';
DROP INDEX IF EXISTS seo_search_snapshots_date_query_page_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS seo_search_snapshots_property_date_query_page_uidx ON seo_search_snapshots(property_id, reporting_date, query, page);
CREATE INDEX IF NOT EXISTS seo_search_snapshots_property_date_idx ON seo_search_snapshots(property_id, reporting_date);
CREATE INDEX IF NOT EXISTS seo_search_snapshots_property_query_idx ON seo_search_snapshots(property_id, query);
CREATE INDEX IF NOT EXISTS seo_search_snapshots_property_date_query_idx ON seo_search_snapshots(property_id, reporting_date, query);
CREATE INDEX IF NOT EXISTS seo_search_snapshots_property_date_page_idx ON seo_search_snapshots(property_id, reporting_date, page);
CREATE TABLE IF NOT EXISTS seo_search_daily_totals (
  property_id text NOT NULL DEFAULT '__legacy_unscoped__', reporting_date date NOT NULL, clicks double precision NOT NULL DEFAULT 0,
  impressions double precision NOT NULL DEFAULT 0, ctr double precision NOT NULL DEFAULT 0,
  position double precision NOT NULL DEFAULT 0, imported_at timestamp NOT NULL DEFAULT now()
);
ALTER TABLE seo_search_daily_totals ADD COLUMN IF NOT EXISTS property_id text NOT NULL DEFAULT '__legacy_unscoped__';
ALTER TABLE seo_search_daily_totals DROP CONSTRAINT IF EXISTS seo_search_daily_totals_pkey;
DROP INDEX IF EXISTS seo_search_daily_totals_date_idx;
CREATE UNIQUE INDEX IF NOT EXISTS seo_search_daily_totals_property_date_uidx ON seo_search_daily_totals(property_id, reporting_date);
CREATE INDEX IF NOT EXISTS seo_search_daily_totals_property_date_idx ON seo_search_daily_totals(property_id, reporting_date);
CREATE TABLE IF NOT EXISTS seo_sync_runs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(), property_id text NOT NULL DEFAULT '__legacy_unscoped__', status text NOT NULL DEFAULT 'running',
  trigger text NOT NULL DEFAULT 'scheduled', start_date date NOT NULL, end_date date NOT NULL,
  rows_imported integer NOT NULL DEFAULT 0, pages_completed integer NOT NULL DEFAULT 0,
  error_code text, error_message text, started_at timestamp NOT NULL DEFAULT now(), completed_at timestamp
);
ALTER TABLE seo_sync_runs ADD COLUMN IF NOT EXISTS property_id text NOT NULL DEFAULT '__legacy_unscoped__';
DROP INDEX IF EXISTS seo_sync_runs_started_idx;
CREATE INDEX IF NOT EXISTS seo_sync_runs_property_started_idx ON seo_sync_runs(property_id, started_at);
