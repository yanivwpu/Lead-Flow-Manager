ALTER TABLE seo_action_versions ADD COLUMN IF NOT EXISTS evidence_snapshot jsonb;
-- Best-effort legacy baseline: exact pre-0099 evidence may already have been overwritten and cannot be reconstructed.
UPDATE seo_action_versions v SET evidence_snapshot=jsonb_build_object(
  'opportunityId',o.id,'opportunityType',o.opportunity_type,'queryCluster',o.query_cluster,'targetPage',o.target_page,
  'currentMetrics',o.current_metrics,'previousMetrics',o.previous_metrics,'priorityScore',o.priority_score,
  'confidenceScore',o.confidence_score,'estimatedUpside',o.estimated_upside,'reason',o.reason,'evidence',o.evidence,
  'contentFingerprint',a.original_content_fingerprint,'pageSnapshotId',v.page_snapshot_id)
FROM seo_actions a JOIN seo_opportunities o ON o.id=a.opportunity_id
WHERE v.action_id=a.id AND v.evidence_snapshot IS NULL;
ALTER TABLE seo_action_versions ALTER COLUMN evidence_snapshot SET NOT NULL;
DROP INDEX IF EXISTS seo_opportunities_property_cluster_uidx;
CREATE INDEX IF NOT EXISTS seo_opportunities_property_cluster_idx ON seo_opportunities(property_id,cluster_key,detected_at);
