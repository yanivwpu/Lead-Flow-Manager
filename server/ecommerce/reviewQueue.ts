import { sql } from "drizzle-orm";

/**
 * Payload-free, tenant/shop-scoped review actions. Neither query joins customer
 * data or calls any sender/Shopify API. The conditional UPDATE is our durable
 * concurrent-click guard: exactly one reviewer can move pending -> reviewed.
 */
export function pendingEventReviewQuery(accountId: string, shop: string) {
  return sql`
    SELECT id::text AS id, topic, journey, received_at
    FROM ecommerce_growth_event_inbox
    WHERE account_id = ${accountId} AND shop = ${shop} AND state = 'pending'
    ORDER BY received_at ASC, id ASC LIMIT 20
  `;
}

export function markEventReviewedQuery(eventId: string, accountId: string, shop: string) {
  return sql`
    UPDATE ecommerce_growth_event_inbox SET state = 'reviewed'
    WHERE id = CAST(${eventId} AS BIGINT)
      AND account_id = ${accountId} AND shop = ${shop} AND state = 'pending'
    RETURNING id::text AS id
  `;
}
