-- Persistent backlink opportunities. No automatic sending or publication.
CREATE TABLE IF NOT EXISTS seo_backlink_opportunities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_url text NOT NULL,
 target_url text NOT NULL,
 source_host text NOT NULL,
 topic text NOT NULL,
 evidence text NOT NULL,
 source_kind text NOT NULL,
 source_reference text NOT NULL,
 placement text NOT NULL,
 intent text NOT NULL,
 score integer NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'needs_review',
 notes text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (source_url, target_url)
);
CREATE INDEX IF NOT EXISTS seo_backlink_status_priority ON seo_backlink_opportunities(status, score DESC);
