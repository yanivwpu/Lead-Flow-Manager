import { and, eq, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { channelSettings } from "@shared/schema";
import { isInstagramConnectedInAnotherWorkspace, type InstagramIdentity } from "@shared/instagramWorkspaceOwnership";

export class InstagramWorkspaceConflictError extends Error {
  constructor() {
    super("This Instagram account is already connected to another WhachatCRM workspace. Disconnect it there before connecting it here. No messages or credentials were moved.");
    this.name = "InstagramWorkspaceConflictError";
  }
}

/** Read-only preflight. No other workspace identities are returned to the client. */
export async function instagramHasWorkspaceConflict(
  workspaceUserId: string,
  identity: InstagramIdentity,
): Promise<boolean> {
  const rows = await db.select({
    userId: channelSettings.userId,
    channel: channelSettings.channel,
    isConnected: channelSettings.isConnected,
    config: channelSettings.config,
  }).from(channelSettings).where(and(
    eq(channelSettings.channel, "instagram"),
    eq(channelSettings.isConnected, true),
  ));
  return isInstagramConnectedInAnotherWorkspace(rows, workspaceUserId, identity);
}

/**
 * Atomic cross-workspace ownership claim. Advisory locks cover both the IG id
 * and Page id; a concurrent OAuth attempt rechecks inside the write transaction.
 */
export async function saveExclusiveInstagramConnection(
  workspaceUserId: string,
  input: { instagramAccountId: string; pageId: string; config: Record<string, string> },
): Promise<void> {
  if (!input.instagramAccountId.trim() || !input.pageId.trim()) {
    throw new Error("Instagram and Facebook Page identities are required.");
  }

  await db.transaction(async (tx) => {
    const locks = [...new Set([
      `ig:${input.instagramAccountId.trim()}`,
      `page:${input.pageId.trim()}`,
    ])].sort();
    for (const key of locks) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('whachat_instagram_workspace'), hashtext(${key}))`);
    }

    const rows = await tx.select({
      userId: channelSettings.userId,
      channel: channelSettings.channel,
      isConnected: channelSettings.isConnected,
      config: channelSettings.config,
    }).from(channelSettings).where(and(
      eq(channelSettings.channel, "instagram"),
      eq(channelSettings.isConnected, true),
    ));
    if (isInstagramConnectedInAnotherWorkspace(rows, workspaceUserId, input)) {
      throw new InstagramWorkspaceConflictError();
    }

    const existing = await tx.select({ id: channelSettings.id })
      .from(channelSettings)
      .where(and(
        eq(channelSettings.userId, workspaceUserId),
        eq(channelSettings.channel, "instagram"),
      ))
      .limit(1);
    if (existing.length) {
      await tx.update(channelSettings).set({
        isConnected: true,
        isEnabled: true,
        config: input.config,
        updatedAt: new Date(),
      }).where(eq(channelSettings.id, existing[0].id));
    } else {
      await tx.insert(channelSettings).values({
        userId: workspaceUserId,
        channel: "instagram",
        isConnected: true,
        isEnabled: true,
        config: input.config,
      });
    }
  });
}
