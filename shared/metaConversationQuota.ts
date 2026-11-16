import { sql } from "drizzle-orm";

/** Only these customer-initiated Meta messaging sessions consume the 50/2,000 allowance. */
export const META_CUSTOMER_SERVICE_CHANNELS = ["whatsapp", "facebook", "instagram"] as const;

/**
 * Each inbound from a customer extends the 24-hour customer-service window.
 * A new quota unit is opened only after >/= 24 hours without customer inbound
 * in the same Inbox thread. Template/outbound events do not open or extend
 * the subscription window.
 *
 * LAG must include inbound history before period filtering so a reply just
 * after month-end within an existing 24-hour window doesn't count twice.
 */
export function metaCustomerServiceWindowCountQuery(
  workspaceUserId: string,
  periodStart: Date,
  periodEnd: Date,
) {
  return sql`
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
  `;
}
