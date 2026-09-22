-- Run manually only after connecting to the intended database. This transaction
-- is forced read-only and returns counts only: it does not expose row values.
BEGIN TRANSACTION READ ONLY;

WITH checks AS (
  SELECT 'analysis-running-duplicates' AS check_name, count(*)::bigint AS duplicate_groups
  FROM (
    SELECT property_id FROM seo_analysis_runs WHERE status = 'running'
    GROUP BY property_id HAVING count(*) > 1
  ) groups
  UNION ALL
  SELECT 'opportunity-history-duplicates', count(*)::bigint
  FROM (
    SELECT property_id, cluster_key FROM seo_opportunities
    GROUP BY property_id, cluster_key HAVING count(*) > 1
  ) groups
  UNION ALL
  SELECT 'competitor-config-duplicates', count(*)::bigint
  FROM (
    SELECT property_id, domain, coalesce(page_url, '') FROM seo_competitor_config
    GROUP BY property_id, domain, coalesce(page_url, '') HAVING count(*) > 1
  ) groups
  UNION ALL
  SELECT 'competitor-snapshot-duplicates', count(*)::bigint
  FROM (
    SELECT property_id, query_hash, page_hash FROM seo_competitor_snapshots
    GROUP BY property_id, query_hash, page_hash HAVING count(*) > 1
  ) groups
  UNION ALL
  SELECT 'open-action-duplicates', count(*)::bigint
  FROM (
    SELECT property_id, idempotency_key FROM seo_actions
    WHERE status IN ('detected', 'researching', 'proposed', 'approved')
    GROUP BY property_id, idempotency_key HAVING count(*) > 1
  ) groups
)
SELECT check_name, duplicate_groups
FROM checks
UNION ALL
SELECT 'retired-opportunity-unique-index-present',
       (to_regclass('seo_opportunities_property_cluster_uidx') IS NOT NULL)::int::bigint
UNION ALL
SELECT 'final-opportunity-history-index-present',
       (to_regclass('seo_opportunities_property_cluster_idx') IS NOT NULL)::int::bigint
ORDER BY check_name;

COMMIT;
