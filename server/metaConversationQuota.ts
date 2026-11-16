import { sql } from "drizzle-orm";
import { db } from "../drizzle/db";

/**
 * WhachatCRM subscription allowance — NOT Meta's per-template-message billing.
 *
 * A new unit starts on a customer inbound message via WhatsApp, Messenger or
 * Instagram when there was no inbound message in the same channel thread in
 * the preceding 24 hours. Each additional customer inbound extends that
 * channel's customer-service window; outbound/template sends never start one.
 *
 * LAG is intentionally evaluated over ALL history before filtering to the
 * billing period: a window opened just before month-end cannot be billed
 * again for a reply just after midnight.
 *
 * No mutations, materialized counter, or data migration are required.
 * The existing users.monthly_conversations value is a legacy new-thread counter
 * and must not be used as the source of truth for this allowance.
 */
export async function countMetaCustomerServiceWindows(
  workspaceUserId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<number> {
  const result = await db.execute(sql`
    WITH customer_inbound AS (
      SELECT
        m.created_at AS received_at,
        LAG(m.created_at) OVER (
          PARTITION BY m.conversation_id
          ORDER BY m.created_at, m.id
        ) AS previous_inbound_at
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.user_id = ${workspaceUserId}
        AND c.user_id = ${workspaceUserId}
        AND m.direction = 'inbound'
        AND m.created_at IS NOT NULL
        AND c.channel IN ('whatsapp', 'facebook', 'instagram')
    )
    SELECT COUNT(*)::int AS session_count
    FROM customer_inbound
    WHERE received_at >= ${periodStart.toISOString()}::timestamp
      AND received_at < ${periodEnd.toISOString()}::timestamp
      AND (
        previous_inbound_at IS NULL
        OR received_at >= previous_inbound_at + INTERVAL '24 hours'
      )
  `);
  return Math.max(0, Number(result.rows[0]?.session_count || 0));
}
