import { sql } from "drizzle-orm";
import { parseReviewEventId } from "./reviewIntent";

export type TaskScheduleChange = {
  action: "schedule_internal_order_task";
  taskId: string;
  assigneeUserId: string | null;
  dueAt: string | null;
  reminderMinutes: 0 | 15 | 60 | 1440 | null;
};
const REMINDERS = new Set([0, 15, 60, 1440]);

/** Exact request shape; never accept tenant/shop/contact from a client. */
export function parseTaskScheduleChange(value: unknown, now = Date.now()): TaskScheduleChange | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  if (Object.keys(obj).length !== 5 ||
      obj.action !== "schedule_internal_order_task") return null;
  const taskId = parseReviewEventId(obj.taskId);
  if (!taskId) return null;
  const assigneeUserId = obj.assigneeUserId;
  if (assigneeUserId !== null &&
      (typeof assigneeUserId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(assigneeUserId)))
    return null;
  let dueAt: string | null = null;
  if (obj.dueAt !== null) {
    if (typeof obj.dueAt !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(obj.dueAt)) return null;
    const parsed = Date.parse(obj.dueAt);
    if (!Number.isFinite(parsed) || parsed < now - 30 * 86400_000 || parsed > now + 366 * 86400_000)
      return null;
    dueAt = new Date(parsed).toISOString();
  }
  const reminderMinutes = obj.reminderMinutes;
  if (reminderMinutes !== null &&
      (typeof reminderMinutes !== "number" || !REMINDERS.has(reminderMinutes))) return null;
  if (dueAt === null && reminderMinutes !== null) return null;
  return {
    action:"schedule_internal_order_task", taskId,
    assigneeUserId: assigneeUserId as string | null,
    dueAt, reminderMinutes: reminderMinutes as TaskScheduleChange["reminderMinutes"]
  };
}
export const taskScheduleReadyQuery = sql`
  SELECT to_regclass('public.ecommerce_growth_order_task_schedule')::text AS table_name
`;
export function taskScheduleReady(row: unknown): boolean {
  return !!row && typeof row === "object" &&
    typeof (row as { table_name?: unknown }).table_name === "string";
}

/** A separately scoped read, run only when the optional schedule table exists. */
export function readScheduledOrderSupportTaskListQuery(accountId: string, shop: string) {
  return sql`
    SELECT t.id::text AS id, t.state, t.created_at,
           c.id AS contact_id, c.name AS contact_name,
           order_link.activity_id::text AS order_activity_id,
           order_link.order_name AS order_name,
           s.assignee_user_id, s.due_at, s.reminder_minutes,
           CASE WHEN t.state='open' AND s.due_at IS NOT NULL
                  AND s.reminder_minutes IS NOT NULL
                  AND s.due_at - (s.reminder_minutes * interval '1 minute') <= NOW()
                THEN TRUE ELSE FALSE END AS reminder_due
    FROM ecommerce_growth_order_support_tasks t
    INNER JOIN contacts c ON c.id=t.contact_id AND c.user_id=t.account_id
    LEFT JOIN ecommerce_growth_order_task_schedule s
      ON s.task_id=t.id AND s.account_id=t.account_id AND s.shop=t.shop
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
    WHERE t.account_id=${accountId} AND t.shop=${shop}
    ORDER BY CASE WHEN t.state='open' THEN 0 ELSE 1 END,
             t.created_at DESC, t.id DESC LIMIT 20
  `;
}

/** Atomic tenant-checked task upsert; never updates the original CRM follow-up. */
export function saveTaskScheduleQuery(change: TaskScheduleChange, accountId: string, shop: string) {
  return sql`
    INSERT INTO ecommerce_growth_order_task_schedule
      (task_id, account_id, shop, assignee_user_id, due_at, reminder_minutes, updated_at)
    SELECT t.id,t.account_id,t.shop,${change.assigneeUserId},
           CAST(${change.dueAt} AS TIMESTAMPTZ),${change.reminderMinutes},NOW()
    FROM ecommerce_growth_order_support_tasks t
    INNER JOIN contacts c ON c.id=t.contact_id AND c.user_id=t.account_id
    WHERE t.id=CAST(${change.taskId} AS BIGINT)
      AND t.account_id=${accountId} AND t.shop=${shop}
      AND t.state='open'
      AND (${change.assigneeUserId}::text IS NULL
           OR ${change.assigneeUserId}::text=${accountId}
           OR EXISTS (
             SELECT 1 FROM team_members tm
             WHERE tm.owner_id=${accountId}
               AND tm.member_id=${change.assigneeUserId}::text
               AND tm.status='active'
           ))
    ON CONFLICT (task_id) DO UPDATE SET
      assignee_user_id=EXCLUDED.assignee_user_id,
      due_at=EXCLUDED.due_at,
      reminder_minutes=EXCLUDED.reminder_minutes,
      updated_at=NOW()
    WHERE ecommerce_growth_order_task_schedule.account_id=EXCLUDED.account_id
      AND ecommerce_growth_order_task_schedule.shop=EXCLUDED.shop
    RETURNING task_id::text AS id
  `;
}
