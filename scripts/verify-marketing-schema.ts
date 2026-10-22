/** Read-only Phase 1 deployment prerequisite. Never applies DDL or backfills. */
import { pathToFileURL } from "node:url";
import { Pool } from "pg";

export async function verifyMarketingSchema(client: { query: (text: string) => Promise<{rows: any[]}> }) {
  const expected: Record<string, string[]> = {
    marketing_sender_profiles: ["workspace_user_id", "mailbox_id", "brand", "postal_address", "verified_at", "verified_by"],
    marketing_suppressions: ["workspace_user_id", "email_normalized", "scope", "reason", "source", "suppressed_at"],
    prospect_outreach_queue_items: ["workspace_user_id", "recipient_identity_normalized", "link_rendering_snapshot"],
  };
  const {rows} = await client.query("SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema=current_schema()");
  const missing = Object.entries(expected).flatMap(([table, columns]) => columns.filter(column => !rows.some(r => r.table_name===table && r.column_name===column)).map(column => `${table}.${column}`));
  if (missing.length) throw new Error(`marketing_schema_incomplete: ${missing.join(", ")}`);
  for (const table of ["marketing_sender_profiles","marketing_suppressions"]) {
    if (rows.some(r=>r.table_name===table && expected[table].includes(r.column_name) && r.is_nullable!=="NO")) throw new Error(`marketing_nullable_identity: ${table}`);
  }
  const snapshot = rows.find(r => r.table_name==="prospect_outreach_queue_items" && r.column_name==="link_rendering_snapshot");
  if (snapshot?.data_type !== "jsonb" || snapshot.is_nullable !== "NO") throw new Error("marketing_snapshot_schema_invalid");
  const constraints = (await client.query("SELECT t.relname AS table_name,c.contype,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=current_schema() AND t.relname IN ('marketing_suppressions','marketing_sender_profiles')")).rows;
  for (const table of ["marketing_suppressions","marketing_sender_profiles"]) {
    const columns = table==="marketing_suppressions" ? "workspace_user_id, email_normalized" : "workspace_user_id, mailbox_id";
    if (!constraints.some(c=>c.table_name===table && c.contype==='p' && c.definition.includes(columns))) throw new Error(`marketing_identity_key_missing: ${table}`);
  }
  if (constraints.some(c=>c.table_name==='marketing_suppressions' && c.contype==='f' && /REFERENCES (?:\w+\.)?contacts\b/.test(c.definition))) throw new Error("marketing_ledger_has_contact_fk");
  if (!constraints.some(c=>c.table_name==='marketing_suppressions' && c.contype==='c' && c.definition.includes('scope'))) throw new Error("marketing_scope_constraint_missing");
  return { ready: true, checkedTables: Object.keys(expected) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required for explicitly selected database");
  const pool = new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:10000});
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout='10s'");
    console.log(JSON.stringify(await verifyMarketingSchema(client)));
  } finally { await client.query("ROLLBACK"); client.release(); await pool.end(); }
}
