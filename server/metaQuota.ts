import { sql } from "drizzle-orm";
import { db } from "../drizzle/db";

/** Missing schema is expected before the separately reviewed additive migration. */
export async function getMetaQuotaSummary(userId: string, periodStart: Date) {
  try {
    const result = await db.execute(sql`
      SELECT r.tracking_started_at AT TIME ZONE 'UTC' AS tracking_started_at, r.enforce_from AT TIME ZONE 'UTC' AS enforce_from,
        (SELECT count(*)::int FROM meta_quota_sessions s WHERE s.user_id = ${userId}
          AND s.period_start = (${periodStart.toISOString()}::timestamptz AT TIME ZONE 'UTC')) AS sessions,
        (SELECT count(*)::int FROM conversations c WHERE c.user_id = ${userId}) AS threads,
        (SELECT max(m.created_at) AT TIME ZONE 'UTC' FROM messages m JOIN conversations c ON c.id = m.conversation_id
          WHERE m.user_id = ${userId} AND c.channel = 'webchat' AND m.direction = 'inbound') AS website_last_inbound
      FROM users u LEFT JOIN meta_quota_rollout r ON r.user_id = u.id WHERE u.id = ${userId}`);
    const row = result.rows[0];
    return {
      available: true,
      sessions: Number(row?.sessions ?? 0),
      threads: row ? Number(row.threads) : null,
      websiteLastInbound: row?.website_last_inbound ?? null,
      trackingStartedAt: row?.tracking_started_at ?? null,
      // Both a release switch AND an account's reviewed future-period adoption are required.
      enforced: process.env.META_QUOTA_ENFORCEMENT === "true" && !!row?.enforce_from &&
        new Date(String(row.enforce_from)) <= periodStart,
    };
  } catch (error: any) {
    // Fail open for replies; never silently fall back to an inconsistent legacy count.
    console.error("[MetaQuota] ledger unavailable", { code: error?.code ?? "unknown" });
    return { available: false, sessions: null, threads: null, websiteLastInbound: null,
      trackingStartedAt: null, enforced: false };
  }
}
