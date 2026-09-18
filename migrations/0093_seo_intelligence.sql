CREATE TABLE IF NOT EXISTS seo_search_snapshots (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(), reporting_date date NOT NULL,
  query text NOT NULL, page text NOT NULL, clicks double precision NOT NULL DEFAULT 0,
  impressions double precision NOT NULL DEFAULT 0, ctr double precision NOT NULL DEFAULT 0,
  position double precision NOT NULL DEFAULT 0, imported_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS seo_search_snapshots_date_query_page_uidx ON seo_search_snapshots(reporting_date, query, page);
CREATE INDEX IF NOT EXISTS seo_search_snapshots_date_idx ON seo_search_snapshots(reporting_date);
CREATE INDEX IF NOT EXISTS seo_search_snapshots_query_idx ON seo_search_snapshots(query);
CREATE TABLE IF NOT EXISTS seo_sync_runs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(), status text NOT NULL DEFAULT 'running',
  trigger text NOT NULL DEFAULT 'scheduled', start_date date NOT NULL, end_date date NOT NULL,
  rows_imported integer NOT NULL DEFAULT 0, pages_completed integer NOT NULL DEFAULT 0,
  error_code text, error_message text, started_at timestamp NOT NULL DEFAULT now(), completed_at timestamp
);
CREATE INDEX IF NOT EXISTS seo_sync_runs_started_idx ON seo_sync_runs(started_at);
