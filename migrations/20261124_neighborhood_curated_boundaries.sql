-- Offline curated Overture neighborhood index, not a request-time Parquet scan.
-- All imported records are unreviewed by default and invisible publicly until
-- independently checked for locality identity, geometry, license and provenance.
CREATE TABLE IF NOT EXISTS neighborhood_curated_boundaries (
  id varchar PRIMARY KEY,
  country varchar(2) NOT NULL,
  state text NOT NULL,
  city text NOT NULL,
  name text NOT NULL,
  state_key text NOT NULL,
  city_key text NOT NULL,
  name_key text NOT NULL,
  source_kind text NOT NULL DEFAULT 'overture',
  source_id text NOT NULL,
  source_version text NOT NULL,
  subtype text NOT NULL,
  license text NOT NULL,
  attribution text NOT NULL,
  geometry jsonb NOT NULL,
  reviewed boolean NOT NULL DEFAULT false,
  retrieved_at timestamptz NOT NULL,
  CONSTRAINT neighborhood_curated_source_unique UNIQUE (source_kind, source_id)
);
CREATE INDEX IF NOT EXISTS neighborhood_curated_identity_idx
  ON neighborhood_curated_boundaries (country, state_key, city_key, name_key);
