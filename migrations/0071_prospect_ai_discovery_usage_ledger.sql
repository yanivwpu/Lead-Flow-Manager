-- Immutable Prospect AI discovery usage ledger.
-- Monthly/billing-period quota must NOT depend on mutable discovery_results rows
-- (send-to-review, deletes, or CASCADE must never refund usage).

CREATE TABLE IF NOT EXISTS prospect_ai_discovery_usage_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  search_id varchar REFERENCES prospect_ai_discovery_searches(id) ON DELETE SET NULL,
  result_id varchar REFERENCES prospect_ai_discovery_results(id) ON DELETE SET NULL,
  units integer NOT NULL DEFAULT 1,
  reason text NOT NULL DEFAULT 'discover',
  note text,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prospect_ai_discovery_usage_events_workspace_created_idx
  ON prospect_ai_discovery_usage_events (workspace_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS prospect_ai_discovery_usage_events_workspace_reason_idx
  ON prospect_ai_discovery_usage_events (workspace_user_id, reason);

-- One backfill event per historical search (units = result rows). Idempotent-ish:
-- only when no ledger rows exist for that search yet.
INSERT INTO prospect_ai_discovery_usage_events (
  workspace_user_id,
  search_id,
  units,
  reason,
  created_at
)
SELECT
  r.workspace_user_id,
  r.search_id,
  COUNT(*)::integer,
  'backfill',
  MIN(r.created_at)
FROM prospect_ai_discovery_results r
WHERE NOT EXISTS (
  SELECT 1
  FROM prospect_ai_discovery_usage_events e
  WHERE e.search_id = r.search_id
    AND e.reason IN ('discover', 'backfill')
)
GROUP BY r.workspace_user_id, r.search_id;
