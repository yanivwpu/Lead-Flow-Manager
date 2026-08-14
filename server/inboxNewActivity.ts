/**
 * Per-user Inbox new-activity badge counter.
 * Increment only after successful inbound persist (dedupe confirmed), before notifyUser.
 */
import { eq, sql } from "drizzle-orm";
import { users } from "@shared/schema";
import {
  INBOX_ACTIVITY_COUNT_SOFT_CAP,
  type InboxActivityPayload,
} from "@shared/inboxNewActivity";
import { db } from "../drizzle/db";

function rowsFromExecute(result: unknown): Record<string, unknown>[] {
  if (!result || typeof result !== "object") return [];
  const rows = (result as { rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}

/** Atomically increment; returns the new count. */
export async function incrementInboxNewActivity(
  userId: string,
  by = 1,
): Promise<number> {
  if (!userId || by <= 0) return 0;
  const result = await db.execute(sql`
    UPDATE users
    SET inbox_new_activity_count = LEAST(
      COALESCE(inbox_new_activity_count, 0) + ${by},
      ${INBOX_ACTIVITY_COUNT_SOFT_CAP}
    )
    WHERE id = ${userId}
    RETURNING inbox_new_activity_count
  `);
  const row = rowsFromExecute(result)[0];
  return Number(row?.inbox_new_activity_count ?? 0);
}

/** Zero the badge and stamp last checked — does NOT mark conversations read. */
export async function ackInboxNewActivity(userId: string): Promise<InboxActivityPayload> {
  if (!userId) {
    return { count: 0, lastInboxCheckedAt: null };
  }
  const now = new Date();
  await db
    .update(users)
    .set({
      inboxNewActivityCount: 0,
      lastInboxCheckedAt: now,
    })
    .where(eq(users.id, userId));
  return {
    count: 0,
    lastInboxCheckedAt: now.toISOString(),
  };
}

export async function getInboxNewActivity(userId: string): Promise<InboxActivityPayload> {
  if (!userId) {
    return { count: 0, lastInboxCheckedAt: null };
  }
  const rows = await db
    .select({
      count: users.inboxNewActivityCount,
      lastInboxCheckedAt: users.lastInboxCheckedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const row = rows[0];
  return {
    count: Number(row?.count ?? 0),
    lastInboxCheckedAt: row?.lastInboxCheckedAt
      ? new Date(row.lastInboxCheckedAt).toISOString()
      : null,
  };
}
