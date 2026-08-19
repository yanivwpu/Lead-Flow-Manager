-- Shopify merchant onboarding: store owner email separately from synthetic identity.
-- Send-once timestamps (not booleans) so failed Resend sends remain retryable.
-- Historical stamp runs only when these columns are first created (no launch blast,
-- and no re-stamp of new merchants on later startups).

DO $patch$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'shopify_welcome_email_sent_at'
  ) THEN
    ALTER TABLE users ADD COLUMN IF NOT EXISTS shopify_owner_email text;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS shopify_welcome_email_sent_at timestamp;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS shopify_activation_email_day5_sent_at timestamp;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS shopify_activation_email_day10_sent_at timestamp;

    UPDATE users
    SET
      shopify_welcome_email_sent_at = COALESCE(shopify_welcome_email_sent_at, shopify_installed_at, NOW()),
      shopify_activation_email_day5_sent_at = COALESCE(shopify_activation_email_day5_sent_at, shopify_installed_at, NOW()),
      shopify_activation_email_day10_sent_at = COALESCE(shopify_activation_email_day10_sent_at, shopify_installed_at, NOW())
    WHERE shopify_installed_at IS NOT NULL;
  ELSE
    ALTER TABLE users ADD COLUMN IF NOT EXISTS shopify_owner_email text;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS shopify_welcome_email_sent_at timestamp;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS shopify_activation_email_day5_sent_at timestamp;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS shopify_activation_email_day10_sent_at timestamp;
  END IF;
END
$patch$;
