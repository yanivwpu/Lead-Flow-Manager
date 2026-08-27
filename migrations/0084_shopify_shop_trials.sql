-- One-trial ledger per canonical Shopify shop while the shop is known.
-- Retention: kept after ordinary uninstall and after WhachatCRM user deletion
-- (original_user_id ON DELETE SET NULL) so reinstall cannot restart a trial.
-- On valid shop/redact the shop-identifying row is deleted with store data.
-- A later reinstall after completed redaction may qualify as a new shop trial.
-- No access tokens, owner email, Shopify shop id, or reusable hash is stored.
-- Ambiguous historical shops receive durable blocked rows (fail-closed).
-- Backfill is idempotent (ON CONFLICT DO NOTHING).

CREATE TABLE IF NOT EXISTS shopify_shop_trials (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_shop text NOT NULL,
  status text NOT NULL DEFAULT 'granted',
  block_reason text,
  trial_started_at timestamp,
  trial_ends_at timestamp,
  trial_plan text NOT NULL DEFAULT 'pro_ai',
  trial_consumed_at timestamp NOT NULL DEFAULT NOW(),
  original_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp DEFAULT NOW(),
  updated_at timestamp DEFAULT NOW()
);

ALTER TABLE shopify_shop_trials ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE shopify_shop_trials ADD COLUMN IF NOT EXISTS block_reason text;
ALTER TABLE shopify_shop_trials ALTER COLUMN trial_started_at DROP NOT NULL;
ALTER TABLE shopify_shop_trials ALTER COLUMN trial_ends_at DROP NOT NULL;
UPDATE shopify_shop_trials SET status = 'backfilled' WHERE status IS NULL;
ALTER TABLE shopify_shop_trials ALTER COLUMN status SET DEFAULT 'granted';
UPDATE shopify_shop_trials SET status = 'granted' WHERE status IS NULL;
ALTER TABLE shopify_shop_trials ALTER COLUMN status SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS shopify_shop_trials_canonical_shop_uidx
  ON shopify_shop_trials (canonical_shop);

DO $status$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shopify_shop_trials_status_check'
  ) THEN
    ALTER TABLE shopify_shop_trials
      ADD CONSTRAINT shopify_shop_trials_status_check
      CHECK (status IN ('granted', 'backfilled', 'blocked_conflict', 'blocked_unknown_history'));
  END IF;
END
$status$;

COMMENT ON TABLE shopify_shop_trials IS
  'One 14-day Pro + AI Brain trial per canonical shop while retained. Kept through uninstall and user deletion. Deleted on shop/redact. Blocked rows prevent automatic grants. Stores no tokens or owner PII.';

COMMENT ON COLUMN shopify_shop_trials.canonical_shop IS
  'Normalized Shopify hostname (lowercase, no protocol/path). Unique while retained. Removed on shop/redact.';

COMMENT ON COLUMN shopify_shop_trials.status IS
  'granted | backfilled | blocked_conflict | blocked_unknown_history. Any status blocks automatic OAuth grant.';

COMMENT ON COLUMN shopify_shop_trials.original_user_id IS
  'First WhachatCRM user that consumed or was associated with the shop trial. SET NULL on user delete; the shop row remains until shop/redact.';

-- Idempotent backfill. Does not grant, restart, or modify any user trial columns.
-- 1) Unambiguous original dates → backfilled
-- 2) Conflicting dates → blocked_conflict (nullable dates)
-- 3) Canonical shop with no original trial dates → blocked_unknown_history
WITH source AS (
  SELECT
    u.id AS user_id,
    CASE
      WHEN u.shopify_shop IS NOT NULL AND trim(u.shopify_shop) <> '' THEN lower(trim(u.shopify_shop))
      WHEN lower(u.email) LIKE '%@shopify.whachatcrm.com'
        THEN lower(split_part(u.email, '@', 1)) || '.myshopify.com'
      ELSE NULL
    END AS canonical_shop,
    u.trial_started_at,
    u.trial_ends_at,
    COALESCE(NULLIF(trim(u.trial_plan), ''), 'pro_ai') AS trial_plan
  FROM users u
), valid AS (
  SELECT *
  FROM source
  WHERE canonical_shop ~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$'
), dated AS (
  SELECT *
  FROM valid
  WHERE trial_started_at IS NOT NULL
    AND trial_ends_at IS NOT NULL
), distinct_tuples AS (
  SELECT
    canonical_shop,
    count(DISTINCT (trial_started_at, trial_ends_at, trial_plan)) AS n
  FROM dated
  GROUP BY canonical_shop
), chosen AS (
  SELECT DISTINCT ON (n.canonical_shop)
    n.canonical_shop,
    n.user_id,
    n.trial_started_at,
    n.trial_ends_at,
    n.trial_plan
  FROM dated n
  INNER JOIN distinct_tuples d
    ON d.canonical_shop = n.canonical_shop
   AND d.n = 1
  ORDER BY n.canonical_shop, n.trial_started_at ASC, n.user_id ASC
)
INSERT INTO shopify_shop_trials (
  canonical_shop,
  status,
  block_reason,
  trial_started_at,
  trial_ends_at,
  trial_plan,
  trial_consumed_at,
  original_user_id,
  created_at,
  updated_at
)
SELECT
  canonical_shop,
  'backfilled',
  NULL,
  trial_started_at,
  trial_ends_at,
  trial_plan,
  trial_started_at,
  user_id,
  NOW(),
  NOW()
FROM chosen
ON CONFLICT (canonical_shop) DO NOTHING;

INSERT INTO shopify_shop_trials (
  canonical_shop,
  status,
  block_reason,
  trial_started_at,
  trial_ends_at,
  trial_plan,
  trial_consumed_at,
  original_user_id,
  created_at,
  updated_at
)
SELECT
  d.canonical_shop,
  'blocked_conflict',
  'conflicting_trial_dates',
  NULL,
  NULL,
  'pro_ai',
  NOW(),
  NULL,
  NOW(),
  NOW()
FROM (
  SELECT canonical_shop
  FROM (
    SELECT
      CASE
        WHEN shopify_shop IS NOT NULL AND trim(shopify_shop) <> '' THEN lower(trim(shopify_shop))
        WHEN lower(email) LIKE '%@shopify.whachatcrm.com'
          THEN lower(split_part(email, '@', 1)) || '.myshopify.com'
        ELSE NULL
      END AS canonical_shop,
      trial_started_at,
      trial_ends_at,
      COALESCE(NULLIF(trim(trial_plan), ''), 'pro_ai') AS trial_plan
    FROM users
  ) raw
  WHERE canonical_shop ~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$'
    AND trial_started_at IS NOT NULL
    AND trial_ends_at IS NOT NULL
  GROUP BY canonical_shop
  HAVING count(DISTINCT (trial_started_at, trial_ends_at, trial_plan)) > 1
) d
ON CONFLICT (canonical_shop) DO NOTHING;

INSERT INTO shopify_shop_trials (
  canonical_shop,
  status,
  block_reason,
  trial_started_at,
  trial_ends_at,
  trial_plan,
  trial_consumed_at,
  original_user_id,
  created_at,
  updated_at
)
SELECT
  v.canonical_shop,
  'blocked_unknown_history',
  'no_original_trial_dates',
  NULL,
  NULL,
  'pro_ai',
  NOW(),
  NULL,
  NOW(),
  NOW()
FROM (
  SELECT DISTINCT canonical_shop
  FROM (
    SELECT
      CASE
        WHEN shopify_shop IS NOT NULL AND trim(shopify_shop) <> '' THEN lower(trim(shopify_shop))
        WHEN lower(email) LIKE '%@shopify.whachatcrm.com'
          THEN lower(split_part(email, '@', 1)) || '.myshopify.com'
        ELSE NULL
      END AS canonical_shop,
      trial_started_at,
      trial_ends_at
    FROM users
  ) raw
  WHERE canonical_shop ~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$'
) v
WHERE NOT EXISTS (
  SELECT 1
  FROM (
    SELECT
      CASE
        WHEN shopify_shop IS NOT NULL AND trim(shopify_shop) <> '' THEN lower(trim(shopify_shop))
        WHEN lower(email) LIKE '%@shopify.whachatcrm.com'
          THEN lower(split_part(email, '@', 1)) || '.myshopify.com'
        ELSE NULL
      END AS canonical_shop,
      trial_started_at,
      trial_ends_at
    FROM users
  ) dated
  WHERE dated.canonical_shop = v.canonical_shop
    AND dated.trial_started_at IS NOT NULL
    AND dated.trial_ends_at IS NOT NULL
)
ON CONFLICT (canonical_shop) DO NOTHING;
