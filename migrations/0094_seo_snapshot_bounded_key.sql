CREATE EXTENSION IF NOT EXISTS pgcrypto;
ALTER TABLE seo_search_snapshots ADD COLUMN IF NOT EXISTS natural_key_hash text;
UPDATE seo_search_snapshots
SET natural_key_hash = encode(digest(convert_to(query, 'UTF8') || decode('00', 'hex') || convert_to(page, 'UTF8'), 'sha256'), 'hex')
WHERE natural_key_hash IS NULL;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM seo_search_snapshots
    GROUP BY property_id, reporting_date, natural_key_hash
    HAVING COUNT(DISTINCT (query, page)) > 1
  ) THEN
    RAISE EXCEPTION 'seo_search_snapshots natural key hash collision detected';
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS seo_search_snapshots_property_date_hash_uidx
  ON seo_search_snapshots(property_id, reporting_date, natural_key_hash);
ALTER TABLE seo_search_snapshots ALTER COLUMN natural_key_hash SET NOT NULL;
DROP INDEX IF EXISTS seo_search_snapshots_property_date_query_page_uidx;
DROP INDEX IF EXISTS seo_search_snapshots_property_query_idx;
DROP INDEX IF EXISTS seo_search_snapshots_property_date_query_idx;
DROP INDEX IF EXISTS seo_search_snapshots_property_date_page_idx;
