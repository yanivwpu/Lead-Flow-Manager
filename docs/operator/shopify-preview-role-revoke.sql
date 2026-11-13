-- DBA REVIEW DRAFT ONLY. Separate cleanup approval; exact temporary role only.
-- Verify production target and exclusive ownership/use of this role first.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '10s';
DO $guard$
BEGIN
  IF current_database()<>'neondb' THEN RAISE EXCEPTION 'wrong_database'; END IF;
END
$guard$;
ALTER ROLE shopify_pilot_preview_ro NOLOGIN PASSWORD NULL VALID UNTIL '1970-01-01 00:00:00+00';
REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM shopify_pilot_preview_ro;
REVOKE USAGE ON SCHEMA public FROM shopify_pilot_preview_ro;
REVOKE CONNECT ON DATABASE neondb FROM shopify_pilot_preview_ro;
COMMIT;
-- Password expiry/NOLOGIN do not end existing sessions. Terminate only this role.
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
WHERE usename='shopify_pilot_preview_ro' AND pid<>pg_backend_pid();
-- If this fails on unexpected dependencies, STOP; never use DROP OWNED/CASCADE
-- or REASSIGN OWNED to force cleanup. Investigate with read-only metadata.
DROP ROLE shopify_pilot_preview_ro;
SELECT NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='shopify_pilot_preview_ro') AS role_removed,
  NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename='shopify_pilot_preview_ro') AS sessions_removed;
