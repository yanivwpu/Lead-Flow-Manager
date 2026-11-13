-- Read-only metadata verification, using the existing authorized DBA connection.
-- This simulates PR #302's guard for the named role; no SET ROLE or authentication.
WITH target AS (SELECT * FROM pg_roles WHERE rolname='shopify_pilot_preview_ro'),
roles AS (SELECT r.* FROM pg_roles r, target t WHERE r.oid=t.oid OR pg_has_role(t.oid,r.oid,'MEMBER'))
SELECT current_database() AS database_name,
  (SELECT count(*) FROM target) AS role_count,
  (SELECT rolcanlogin FROM target) AS login_enabled,
  (SELECT rolvaliduntil FROM target) AS expires_at,
  (SELECT rolvaliduntil > now() AND rolvaliduntil <= now()+interval '24 hours' FROM target) AS within_approved_lifetime,
  (SELECT count(*) FROM roles) AS reachable_roles,
  (SELECT has_database_privilege(oid,current_database(),'CONNECT') FROM target) AS can_connect,
  (SELECT has_schema_privilege(oid,'public','USAGE') FROM target) AS public_usage,
  (SELECT has_database_privilege(oid,current_database(),'TEMP') FROM target) AS inherited_temp,
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')) AS current_public_relations,
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN target t
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')
    AND NOT has_table_privilege(t.oid,c.oid,'SELECT')) AS missing_select,
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f') AND c.relrowsecurity) AS rls_relations,
  EXISTS(SELECT 1 FROM roles r WHERE r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls
    OR has_database_privilege(r.oid,current_database(),'CREATE')
    OR EXISTS(SELECT 1 FROM pg_database d WHERE d.datname=current_database() AND d.datdba=r.oid)
    OR EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
      AND (n.nspowner=r.oid OR has_schema_privilege(r.oid,n.oid,'CREATE')))
    OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND (c.relowner=r.oid
        OR (c.relkind IN ('r','p','v','m','f') AND (has_table_privilege(r.oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
          OR has_any_column_privilege(r.oid,c.oid,'INSERT,UPDATE')))
        OR (c.relkind='S' AND has_sequence_privilege(r.oid,c.oid,'USAGE,UPDATE'))))) AS forbidden_capability;
