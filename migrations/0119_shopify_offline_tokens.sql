-- Additive only: no token exchange, backfill or live credential changes.
CREATE TABLE IF NOT EXISTS shopify_offline_tokens (
  user_id varchar PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  shop text NOT NULL UNIQUE,
  credential_ref text NOT NULL UNIQUE,
  app_client_id text NOT NULL,
  encrypted_pair text NOT NULL,
  access_expires_at timestamptz NOT NULL,
  refresh_expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reauthorization_required')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Durable intent only, no credential copies. A lost migration response fences legacy API use
-- until an explicitly authorized recovery succeeds; never automatically exchange these rows.
CREATE TABLE IF NOT EXISTS shopify_offline_migration_attempts (
  user_id varchar PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  shop text NOT NULL UNIQUE,
  first_attempt_at timestamptz NOT NULL DEFAULT now()
);
-- Covers uninstall, shop/redact, reassignment and account deletion, including old writers.
CREATE OR REPLACE FUNCTION purge_changed_shopify_offline_tokens() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM shopify_offline_tokens WHERE user_id = OLD.id
    AND (shop IS DISTINCT FROM NEW.shopify_shop OR credential_ref IS DISTINCT FROM NEW.shopify_access_token);
  DELETE FROM shopify_offline_migration_attempts WHERE user_id = OLD.id
    AND (OLD.shopify_shop IS DISTINCT FROM NEW.shopify_shop OR OLD.shopify_access_token IS DISTINCT FROM NEW.shopify_access_token);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS purge_changed_shopify_offline_tokens ON users;
CREATE TRIGGER purge_changed_shopify_offline_tokens AFTER UPDATE OF shopify_shop, shopify_access_token ON users
FOR EACH ROW EXECUTE FUNCTION purge_changed_shopify_offline_tokens();
