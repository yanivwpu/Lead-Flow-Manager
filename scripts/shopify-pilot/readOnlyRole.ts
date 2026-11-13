import type { Client } from './identityPreview';

/** Check session user and every reachable role: NOINHERIT membership must not
 * allow SET ROLE into a writer. No role names/credentials are returned to logs. */
export async function requireReadOnlyRole(client: Client) {
  await client.query('BEGIN READ ONLY');
  try {
    const result = await client.query(`WITH roles AS (
      SELECT * FROM pg_roles WHERE pg_has_role(session_user,oid,'MEMBER') OR rolname=session_user
    ) SELECT current_user=session_user AND NOT EXISTS (
      SELECT 1 FROM roles r WHERE r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls
      OR has_database_privilege(r.oid,current_database(),'CREATE')
      OR EXISTS(SELECT 1 FROM pg_database d WHERE d.datname=current_database() AND d.datdba=r.oid)
      OR EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
        AND (n.nspowner=r.oid OR has_schema_privilege(r.oid,n.oid,'CREATE')))
      OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND (
          c.relowner=r.oid OR
          (c.relkind IN ('r','p','v','m','f') AND (has_table_privilege(r.oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
            OR has_any_column_privilege(r.oid,c.oid,'INSERT,UPDATE'))) OR
          (c.relkind='S' AND has_sequence_privilege(r.oid,c.oid,'USAGE,UPDATE'))))
    ) AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')
      AND NOT has_table_privilege(current_user,c.oid,'SELECT'))
      AND has_schema_privilege(current_user,'public','USAGE') AS read_only_role`);
    if (result.rows.length !== 1 || result.rows[0].read_only_role !== true)
      throw Error('read_only_database_role_required');
  } finally { await client.query('ROLLBACK'); }
}
