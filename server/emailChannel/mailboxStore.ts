import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import {
  emailMailboxes,
  emailOauthStates,
  emailMessageDetails,
  type EmailMailbox,
  type InsertEmailMailbox,
  type InsertEmailMessageDetail,
} from "@shared/schema";
import type { EmailSyncStatus } from "@shared/emailChannel";
import { db } from "../../drizzle/db";

export async function getPrimaryEmailMailbox(workspaceUserId: string): Promise<EmailMailbox | undefined> {
  const rows = await db
    .select()
    .from(emailMailboxes)
    .where(eq(emailMailboxes.workspaceUserId, workspaceUserId))
    .orderBy(desc(emailMailboxes.isPrimary), desc(emailMailboxes.createdAt))
    .limit(1);
  return rows[0];
}

export async function getEmailMailboxById(id: string): Promise<EmailMailbox | undefined> {
  const rows = await db.select().from(emailMailboxes).where(eq(emailMailboxes.id, id)).limit(1);
  return rows[0];
}

export async function listEmailMailboxes(workspaceUserId: string): Promise<EmailMailbox[]> {
  return db
    .select()
    .from(emailMailboxes)
    .where(eq(emailMailboxes.workspaceUserId, workspaceUserId))
    .orderBy(desc(emailMailboxes.isPrimary), desc(emailMailboxes.createdAt));
}

export async function countEmailMailboxes(workspaceUserId: string): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(emailMailboxes)
    .where(eq(emailMailboxes.workspaceUserId, workspaceUserId));
  return Number(row?.c ?? 0);
}

export async function insertEmailMailbox(row: InsertEmailMailbox): Promise<EmailMailbox> {
  const [created] = await db.insert(emailMailboxes).values(row).returning();
  return created;
}

export async function updateEmailMailbox(
  id: string,
  patch: Partial<InsertEmailMailbox>,
): Promise<EmailMailbox | undefined> {
  const [updated] = await db
    .update(emailMailboxes)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(emailMailboxes.id, id))
    .returning();
  return updated;
}

export async function deleteEmailMailbox(id: string): Promise<void> {
  await db.delete(emailMailboxes).where(eq(emailMailboxes.id, id));
}

export async function setMailboxSyncStatus(
  id: string,
  status: EmailSyncStatus,
  extra?: { syncError?: string | null; lastSyncAt?: Date; syncCursor?: string | null },
): Promise<void> {
  await updateEmailMailbox(id, {
    syncStatus: status,
    syncError: extra?.syncError ?? null,
    ...(extra?.lastSyncAt ? { lastSyncAt: extra.lastSyncAt } : {}),
    ...(extra?.syncCursor !== undefined ? { syncCursor: extra.syncCursor } : {}),
  });
}

export async function saveOauthState(params: {
  state: string;
  workspaceUserId: string;
  connectedByUserId: string;
  codeVerifier?: string | null;
  redirectUri: string;
  expiresAt: Date;
}): Promise<void> {
  await db.insert(emailOauthStates).values({
    state: params.state,
    workspaceUserId: params.workspaceUserId,
    connectedByUserId: params.connectedByUserId,
    codeVerifier: params.codeVerifier ?? null,
    redirectUri: params.redirectUri,
    expiresAt: params.expiresAt,
  });
}

export async function consumeOauthState(state: string) {
  const rows = await db.select().from(emailOauthStates).where(eq(emailOauthStates.state, state)).limit(1);
  const row = rows[0];
  if (!row) return null;
  await db.delete(emailOauthStates).where(eq(emailOauthStates.state, state));
  if (row.expiresAt.getTime() < Date.now()) return null;
  return row;
}

export async function purgeExpiredOauthStates(): Promise<void> {
  await db.delete(emailOauthStates).where(lt(emailOauthStates.expiresAt, new Date()));
}

export async function insertEmailMessageDetail(row: InsertEmailMessageDetail): Promise<void> {
  await db.insert(emailMessageDetails).values(row).onConflictDoNothing();
}

export async function getEmailMessageDetail(messageId: string) {
  const rows = await db
    .select()
    .from(emailMessageDetails)
    .where(eq(emailMessageDetails.messageId, messageId))
    .limit(1);
  return rows[0];
}

export async function listConnectedMailboxesForPoll(limit = 50): Promise<EmailMailbox[]> {
  return db
    .select()
    .from(emailMailboxes)
    .where(
      and(
        eq(emailMailboxes.provider, "gmail"),
        sql`${emailMailboxes.syncStatus} IN ('connected', 'syncing', 'error')`,
      ),
    )
    .orderBy(emailMailboxes.lastSyncAt)
    .limit(limit);
}

/** Resolve Gmail mailbox by normalized email address (push notifications). */
export async function findActiveGmailMailboxByEmail(
  emailAddress: string,
): Promise<EmailMailbox | undefined> {
  const norm = String(emailAddress || "")
    .trim()
    .toLowerCase();
  if (!norm || !norm.includes("@")) return undefined;
  const rows = await db
    .select()
    .from(emailMailboxes)
    .where(
      and(
        eq(emailMailboxes.provider, "gmail"),
        sql`lower(${emailMailboxes.emailAddress}) = ${norm}`,
        sql`${emailMailboxes.syncStatus} IN ('connected', 'syncing', 'error')`,
      ),
    )
    .orderBy(desc(emailMailboxes.isPrimary), desc(emailMailboxes.updatedAt))
    .limit(1);
  return rows[0];
}

export async function listGmailMailboxesForWatchRenewal(limit = 100): Promise<EmailMailbox[]> {
  return db
    .select()
    .from(emailMailboxes)
    .where(
      and(
        eq(emailMailboxes.provider, "gmail"),
        sql`${emailMailboxes.syncStatus} IN ('connected', 'syncing', 'error')`,
      ),
    )
    .orderBy(emailMailboxes.gmailWatchExpiration)
    .limit(limit);
}

/**
 * Mark mailbox dirty for coalesced sync. Optionally records observed remote historyId
 * without moving syncCursor (never moves cursor backward).
 */
export async function markMailboxSyncPending(params: {
  mailboxId: string;
  observedHistoryId?: string | null;
  notificationAt?: Date;
}): Promise<void> {
  const observed = params.observedHistoryId ? String(params.observedHistoryId) : null;
  if (observed) {
    await db.execute(sql`
      UPDATE email_mailboxes
      SET
        sync_pending = true,
        gmail_watch_last_notification_at = ${params.notificationAt ?? new Date()},
        observed_remote_history_id = CASE
          WHEN observed_remote_history_id IS NULL THEN ${observed}
          WHEN ${observed} ~ '^[0-9]+$' AND observed_remote_history_id ~ '^[0-9]+$'
            AND (${observed})::numeric > (observed_remote_history_id)::numeric
            THEN ${observed}
          WHEN observed_remote_history_id !~ '^[0-9]+$' THEN ${observed}
          ELSE observed_remote_history_id
        END,
        updated_at = now()
      WHERE id = ${params.mailboxId}
    `);
  } else {
    await updateEmailMailbox(params.mailboxId, {
      syncPending: true,
      ...(params.notificationAt
        ? { gmailWatchLastNotificationAt: params.notificationAt }
        : {}),
    });
  }
}

/** Extend an existing lock lease for the same owner. */
export async function extendMailboxSyncLock(params: {
  mailboxId: string;
  owner: string;
  leaseMs: number;
}): Promise<boolean> {
  const until = new Date(Date.now() + params.leaseMs);
  const rows = await db
    .update(emailMailboxes)
    .set({
      syncLockUntil: until,
      syncLockOwner: params.owner,
      updatedAt: new Date(),
    })
    .where(
      and(eq(emailMailboxes.id, params.mailboxId), eq(emailMailboxes.syncLockOwner, params.owner)),
    )
    .returning({ id: emailMailboxes.id });
  return rows.length > 0;
}

export async function tryAcquireMailboxSyncLock(params: {
  mailboxId: string;
  owner: string;
  leaseMs: number;
}): Promise<boolean> {
  const until = new Date(Date.now() + params.leaseMs);
  const now = new Date();
  const rows = await db
    .update(emailMailboxes)
    .set({
      syncLockUntil: until,
      syncLockOwner: params.owner,
      updatedAt: now,
    })
    .where(
      and(
        eq(emailMailboxes.id, params.mailboxId),
        or(isNull(emailMailboxes.syncLockUntil), lt(emailMailboxes.syncLockUntil, now)),
      ),
    )
    .returning({ id: emailMailboxes.id });
  return rows.length > 0;
}

export async function releaseMailboxSyncLock(params: {
  mailboxId: string;
  owner: string;
  clearPending?: boolean;
}): Promise<boolean> {
  const patch: Partial<InsertEmailMailbox> = {
    syncLockUntil: null,
    syncLockOwner: null,
  };
  if (params.clearPending) patch.syncPending = false;
  const rows = await db
    .update(emailMailboxes)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(eq(emailMailboxes.id, params.mailboxId), eq(emailMailboxes.syncLockOwner, params.owner)),
    )
    .returning({ id: emailMailboxes.id });
  return rows.length > 0;
}

export async function clearMailboxSyncPendingIfOwner(params: {
  mailboxId: string;
  owner: string;
}): Promise<void> {
  await db
    .update(emailMailboxes)
    .set({ syncPending: false, updatedAt: new Date() })
    .where(
      and(eq(emailMailboxes.id, params.mailboxId), eq(emailMailboxes.syncLockOwner, params.owner)),
    );
}

export async function isMailboxSyncPending(mailboxId: string): Promise<boolean> {
  const m = await getEmailMailboxById(mailboxId);
  return Boolean(m?.syncPending);
}
