-- RGE Inventory Connector — inventory source connections (MLS / IDX providers)
CREATE TABLE IF NOT EXISTS inventory_sources (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  connection_status text NOT NULL DEFAULT 'disconnected',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  credentials_enc jsonb NOT NULL DEFAULT '{}'::jsonb,
  integration_id varchar REFERENCES integrations(id) ON DELETE SET NULL,
  last_sync_at timestamptz,
  last_sync_status text,
  last_sync_error text,
  last_sync_stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS inventory_sources_user_id_idx ON inventory_sources (user_id);

COMMENT ON TABLE inventory_sources IS 'Per-workspace inventory feed connections (MLS Grid, future IDX providers)';
COMMENT ON COLUMN inventory_sources.provider IS 'mls_grid | showcase_idx (stub) | idx_broker | ihomefinder | csv | reso';
