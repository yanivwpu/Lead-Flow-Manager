-- DBA REVIEW DRAFT ONLY. Do not execute without separate owner/DBA approval.
-- Target: fancy-truth-71283112 / production (br-lucky-salad-anatrtle) / neondb.
-- SQL cannot prove the Neon project/branch: verify those in the operator UI first.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '10s';
DO $guard$
BEGIN
  IF current_database() <> 'neondb' THEN RAISE EXCEPTION 'wrong_database'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='shopify_pilot_preview_ro') THEN
    RAISE EXCEPTION 'role_already_exists_stop_for_review';
  END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')) <> 151 THEN
    RAISE EXCEPTION 'relation_inventory_changed_stop_for_review';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')
      AND (c.relrowsecurity OR c.relkind='f')) THEN
    RAISE EXCEPTION 'rls_or_foreign_relation_requires_review';
  END IF;
  EXECUTE format('CREATE ROLE shopify_pilot_preview_ro NOLOGIN PASSWORD NULL
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
    CONNECTION LIMIT 1 VALID UNTIL %L', (clock_timestamp()+interval '24 hours')::text);
END
$guard$;
GRANT CONNECT ON DATABASE neondb TO shopify_pilot_preview_ro;
GRANT USAGE ON SCHEMA public TO shopify_pilot_preview_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO shopify_pilot_preview_ro;
-- No sequences, memberships, default privileges, grant options or object ownership.
ALTER ROLE shopify_pilot_preview_ro SET default_transaction_read_only = on;
ALTER ROLE shopify_pilot_preview_ro SET statement_timeout = '10s';
ALTER ROLE shopify_pilot_preview_ro SET lock_timeout = '3s';
ALTER ROLE shopify_pilot_preview_ro SET idle_in_transaction_session_timeout = '30s';
COMMIT;
-- Still NOLOGIN with no password. See guide for separately approved secure
-- credential issuance and LOGIN activation. Never put a password in this file.
