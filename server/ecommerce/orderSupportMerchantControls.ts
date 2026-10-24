import { sql } from "drizzle-orm";
import { parseReviewEventId } from "./reviewIntent";

export type SupportTaskChange = { action: "set_internal_order_tasks"; enabled: boolean };
export function parseSupportTaskChange(input: unknown): SupportTaskChange | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const data = input as Record<string, unknown>;
  if (Object.keys(data).length !== 2 || data.action !== "set_internal_order_tasks" ||
      typeof data.enabled !== "boolean") return null;
  return { action: "set_internal_order_tasks", enabled: data.enabled };
}

export function parseSupportTaskComplete(input: unknown): { taskId: string } | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const data = input as Record<string, unknown>;
  if (Object.keys(data).length !== 2 || data.action !== "complete_internal_order_task") return null;
  const taskId = parseReviewEventId(data.taskId);
  return taskId ? { taskId } : null;
}

/** Run a schema check before any settings/task query; missing migrations must fail closed. */
export function orderSupportTablesReady(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const row = result as Record<string, unknown>;
  return typeof row.settings === "string" && typeof row.tasks === "string";
}
export const orderSupportTablesReadyQuery = sql`
  SELECT to_regclass('public.ecommerce_growth_order_task_settings')::text AS settings,
         to_regclass('public.ecommerce_growth_order_support_tasks')::text AS tasks
`;

/** Called inside a verified shop-locked transaction with exactly one active integration. */
export function saveOrderTaskMerchantOptInQuery(accountId: string, shop: string, enabled: boolean) {
  return sql`
    INSERT INTO ecommerce_growth_order_task_settings (account_id, shop, tasks_enabled, updated_at)
    VALUES (${accountId}, ${shop}, ${enabled}, NOW())
    ON CONFLICT (account_id, shop)
    DO UPDATE SET tasks_enabled = EXCLUDED.tasks_enabled, updated_at = NOW()
    RETURNING tasks_enabled AS enabled
  `;
}

/** Every list operation is bounded and keyed to account AND canonical Shopify shop. */
export function readOrderTaskMerchantSettingsQuery(accountId: string, shop: string) {
  return sql`
    SELECT COALESCE(
      (SELECT tasks_enabled FROM ecommerce_growth_order_task_settings
       WHERE account_id = ${accountId} AND shop = ${shop}), FALSE) AS enabled,
      (SELECT COUNT(*)::integer FROM ecommerce_growth_order_support_tasks
       WHERE account_id = ${accountId} AND shop = ${shop} AND state='open') AS open_count,
      (SELECT COUNT(*)::integer FROM ecommerce_growth_order_support_tasks
       WHERE account_id = ${accountId} AND shop = ${shop} AND state='completed') AS completed_count
  `;
}
export function readOrderSupportTaskListQuery(accountId: string, shop: string) {
  return sql`
    SELECT t.id::text AS id, t.state, t.created_at,
           c.id AS contact_id, c.name AS contact_name,
           order_link.activity_id::text AS order_activity_id,
           order_link.order_name AS order_name
    FROM ecommerce_growth_order_support_tasks t
    INNER JOIN contacts c
      ON c.id = t.contact_id AND c.user_id = t.account_id
    LEFT JOIN ecommerce_growth_event_inbox inbox
      ON inbox.id=t.event_id
      AND inbox.account_id=t.account_id AND inbox.shop=t.shop
      AND inbox.topic='orders/create'
    LEFT JOIN LATERAL (
      SELECT a.id AS activity_id,
             a.event_data->>'orderName' AS order_name
      FROM activity_events a
      WHERE a.user_id=t.account_id
        AND a.contact_id=t.contact_id
        AND a.event_type='shopify_order_created'
        AND a.event_data->>'shop'=t.shop
        AND a.event_data->>'shopifyEventId'=inbox.delivery_id
      ORDER BY a.created_at DESC, a.id DESC LIMIT 1
    ) order_link ON TRUE
    WHERE t.account_id = ${accountId} AND t.shop = ${shop}
    ORDER BY CASE WHEN t.state = 'open' THEN 0 ELSE 1 END,
             t.created_at DESC, t.id DESC LIMIT 20
  `;
}
export function markOrderSupportTaskCompleteQuery(taskId: string, accountId: string, shop: string) {
  return sql`
    UPDATE ecommerce_growth_order_support_tasks
    SET state = 'completed'
    WHERE id = CAST(${taskId} AS BIGINT)
      AND account_id = ${accountId}
      AND shop = ${shop}
      AND state = 'open'
    RETURNING id::text AS id
  `;
}
