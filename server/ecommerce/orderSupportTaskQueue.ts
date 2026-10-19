import { sql } from "drizzle-orm";

/**
 * Disabled-by-default, staging-only, INTERNAL task foundation.
 * This never dispatches automations, messages, Shopify calls or checkout actions.
 * A prepared workflow draft is NOT merchant permission to create tasks.
 */
export function isStagingOrderSupportTaskExecutionEnabled(env: {
  RAILWAY_ENVIRONMENT_NAME?: string;
  APP_URL?: string;
  ECOMMERCE_EVENT_RECORDING_ENABLED?: string;
  ECOMMERCE_ORDER_SUPPORT_TASKS_ENABLED?: string;
}): boolean {
  return env.RAILWAY_ENVIRONMENT_NAME === "staging" &&
    env.APP_URL?.replace(/\/$/, "") === "https://whachatcrm-staging-app-staging.up.railway.app" &&
    env.ECOMMERCE_EVENT_RECORDING_ENABLED === "true" &&
    env.ECOMMERCE_ORDER_SUPPORT_TASKS_ENABLED === "true";
}

export type OrderSupportTaskIdentity = {
  accountId: string;
  canonicalShop: string;
  deliveryId: string;
  contactId: string;
};

/**
 * Return a safe parameterized INSERT or null. A real HMAC-verified order must
 * first pass through existing tenant/installation resolution, order persistence
 * and the durable event inbox. This query *re-verifies* inbox ownership, topic,
 * merchant opt-in and contact ownership in PostgreSQL, under one atomic INSERT.
 * Parallel redeliveries race on UNIQUE(event_id), producing at most one task.
 *
 * The recorded event remains pending for merchant manual review; no backfill
 * of historic inbox rows is performed by this function.
 */
export function orderSupportTaskInsertQuery(input: OrderSupportTaskIdentity) {
  const { accountId, canonicalShop, deliveryId, contactId } = input;
  if (!accountId || accountId.length > 128 ||
      !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(canonicalShop) ||
      canonicalShop.length > 255 ||
      !deliveryId || deliveryId.length > 256 ||
      !contactId || contactId.length > 128) return null;

  return sql`
    INSERT INTO ecommerce_growth_order_support_tasks
      (event_id, account_id, shop, contact_id, state)
    SELECT e.id, e.account_id, e.shop, c.id, 'open'
    FROM ecommerce_growth_event_inbox e
    INNER JOIN contacts c
      ON c.id = ${contactId} AND c.user_id = e.account_id
    INNER JOIN ecommerce_growth_order_task_settings prefs
      ON prefs.account_id = e.account_id AND prefs.shop = e.shop
      AND prefs.tasks_enabled = TRUE
    WHERE e.account_id = ${accountId}
      AND e.shop = ${canonicalShop}
      AND e.delivery_id = ${deliveryId}
      AND e.topic = 'orders/create'
      AND e.journey = 'order_support'
      AND e.state = 'pending'
    ON CONFLICT (event_id) DO NOTHING
    RETURNING id::text AS id
  `;
}
