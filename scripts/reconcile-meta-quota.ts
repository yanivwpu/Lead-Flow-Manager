/** Read-only aggregate reconciliation. Requires an explicitly selected database. No repairs/backfill. */
import { Pool } from 'pg';
const url = process.env.META_QUOTA_REPORT_DATABASE_URL;
if (!url) throw new Error('Set META_QUOTA_REPORT_DATABASE_URL explicitly; no implicit production target');
const pool = new Pool({ connectionString: url });
const c = await pool.connect();
try {
  await c.query('BEGIN READ ONLY');
  await c.query("SET LOCAL statement_timeout = '30s'");
  const schema = (await c.query("SELECT to_regclass('meta_quota_sessions') IS NOT NULL AS ready")).rows[0].ready;
  const legacy = (await c.query(`SELECT count(*)::int AS accounts,
    sum(coalesce(monthly_conversations,0))::bigint AS legacy_counter_total FROM users`)).rows[0];
  const traffic = (await c.query(`SELECT c.channel,m.direction,count(*)::int AS messages
    FROM messages m JOIN conversations c ON c.id=m.conversation_id
    WHERE m.created_at >= (now() AT TIME ZONE 'UTC') - interval '31 days'
    GROUP BY c.channel,m.direction ORDER BY c.channel,m.direction`)).rows;
  const ledger = schema ? (await c.query(`SELECT
    (SELECT count(*)::int FROM meta_quota_sessions) AS sessions,
    (SELECT count(*)::int FROM meta_quota_events) AS inbound_receipts,
    (SELECT count(*)::int FROM meta_quota_rollout WHERE enforce_from IS NOT NULL) AS reviewed_accounts,
    (SELECT count(*)::int FROM messages m JOIN conversations c ON c.id=m.conversation_id
      JOIN meta_quota_rollout r ON r.user_id=m.user_id
      LEFT JOIN meta_quota_events e ON e.message_id=m.id
      WHERE m.direction='inbound' AND m.status <> 'failed' AND c.channel IN ('whatsapp','facebook','instagram')
        AND m.created_at >= r.tracking_started_at AND e.message_id IS NULL
        AND NOT EXISTS(SELECT 1 FROM meta_quota_events x WHERE x.user_id=m.user_id AND x.external_message_id=m.external_message_id)) AS missing_receipts,
    (SELECT count(*)::int FROM meta_quota_sessions a JOIN meta_quota_sessions b
      ON a.id<b.id AND a.user_id=b.user_id AND a.channel=b.channel AND a.customer_key=b.customer_key
      AND a.started_at<b.expires_at AND b.started_at<a.expires_at) AS overlapping_sessions`)).rows[0] : null;
  console.log(JSON.stringify({ generatedAt:new Date().toISOString(), readOnly:true, schemaReady:schema,
    legacy, last31Days:traffic, ledger,
    interpretation:'Legacy thread counters are not session counts. Shadow periods have partial coverage. No historical correction or enforcement authorization is implied.' },null,2));
  await c.query('ROLLBACK');
} finally { c.release(); await pool.end(); }
