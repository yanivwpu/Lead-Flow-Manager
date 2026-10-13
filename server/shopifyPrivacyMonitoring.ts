import type { Pool } from 'pg';

/** Independent monitoring probe: aggregate metadata only, no worker/provider writes.
 * Quiet queues cannot prove worker liveness; monitor scheduler execution separately.
 */
export async function inspectPrivacyQueue(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout='10s'");
    await client.query("SET LOCAL lock_timeout='2s'");
    const tasks = (await client.query(`SELECT
      count(*) FILTER (WHERE completed_at IS NULL)::int pending,
      count(*) FILTER (WHERE completed_at IS NULL AND deadline_at<=NOW())::int overdue,
      count(*) FILTER (WHERE completed_at IS NULL AND deadline_at>NOW() AND deadline_at<=NOW()+interval '3 days')::int approaching_deadline,
      count(*) FILTER (WHERE completed_at IS NULL AND (status IN ('blocked','permanent_failure') OR request_kind='access_request'))::int intervention,
      count(*) FILTER (WHERE completed_at IS NULL AND status IN ('retrying','pending_external')
        AND next_attempt_at<NOW()-interval '15 minutes' AND (lease_expires_at IS NULL OR lease_expires_at<NOW()))::int stalled
      FROM shopify_privacy_erasure_tasks`)).rows[0];
    const alerts = (await client.query(`SELECT
      count(*) FILTER (WHERE a.email_reconciliation_required)::int reconciliation,
      count(*) FILTER (WHERE a.email_accepted_at IS NULL AND a.created_at<NOW()-interval '15 minutes')::int delivery_stalled,
      count(*) FILTER (WHERE a.email_accepted_at IS NOT NULL)::int provider_accepted
      FROM shopify_privacy_alerts a JOIN shopify_privacy_erasure_tasks t ON t.id=a.task_id
      WHERE a.resolved_at IS NULL AND t.completed_at IS NULL`)).rows[0];
    return { ok: ![tasks.overdue,tasks.approaching_deadline,tasks.intervention,tasks.stalled,
      alerts.reconciliation,alerts.delivery_stalled].some(n => Number(n)>0),
      tasks,alerts,workerLiveness:'unverified' as const,operatorAcknowledgment:'unverified' as const };
  } finally {
    try { await client.query('ROLLBACK'); } finally { client.release(); }
  }
}
