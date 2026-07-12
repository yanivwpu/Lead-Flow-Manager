import { and, desc, eq, lt, sql } from "drizzle-orm";
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
