/** Internal-only review queue. No publishing, scheduling job, or social credentials. */
export const SEO_SOCIAL_DRAFT_SCHEMA = `
CREATE TABLE IF NOT EXISTS seo_social_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_key text NOT NULL,
  seed_key text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('linkedin','facebook','instagram')),
  topic text NOT NULL,
  target_keyword text NOT NULL,
  destination_url text NOT NULL,
  body text NOT NULL,
  suggested_date date NOT NULL,
  status text NOT NULL DEFAULT 'needs_review' CHECK (status IN ('needs_review','approved','rejected')),
  version integer NOT NULL DEFAULT 1,
  approved_version integer,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_key, seed_key)
);
CREATE INDEX IF NOT EXISTS seo_social_draft_review_status_idx ON seo_social_drafts(status,suggested_date);
`;
