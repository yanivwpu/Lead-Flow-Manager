import { db } from "../drizzle/db";
import { metaCustomerServiceWindowCountQuery } from "@shared/metaConversationQuota";

/**
 * Read-only plan quota, separate from Meta's template message billing.
 * Legacy users.monthly_conversations new-thread counters are not billed here.
 * Inbound events recorded in the Inbox are the source of truth.
 */
export async function countMetaCustomerServiceWindows(
  workspaceUserId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<number> {
  const result = await db.execute(
    metaCustomerServiceWindowCountQuery(workspaceUserId, periodStart, periodEnd),
  );
  return Math.max(0, Number(result.rows[0]?.session_count || 0));
}
