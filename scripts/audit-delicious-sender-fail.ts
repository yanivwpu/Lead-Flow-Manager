/**
 * READ-ONLY: Delicious Digital Marketing mid-run sender failure.
 * Does NOT decrypt tokens, refresh, send, or mutate any rows.
 * Run: npx tsx scripts/audit-delicious-sender-fail.ts
 */
import "dotenv/config";
import { and, asc, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import {
  contacts,
  emailMailboxes,
  prospectOutreachQueueItems,
  prospectOutreachSettings,
} from "../shared/schema";
import { resolveProspectImportDestinationUserId } from "../server/prospectImport/prospectImportService";
import {
  formatProspectQueueItemError,
  isProspectOutreachQueueArmed,
} from "../shared/prospectBulkOutreach";
import { isEmailMailboxSyncStatusSendable } from "../shared/emailMailboxAvailability";

async function main() {
  const wid = await resolveProspectImportDestinationUserId();
  const now = Date.now();

  const settingsRows = await db
    .select()
    .from(prospectOutreachSettings)
    .where(eq(prospectOutreachSettings.workspaceUserId, wid))
    .limit(1);
  const s = settingsRows[0];

  const delicious = await db
    .select({
      id: prospectOutreachQueueItems.id,
      contactId: prospectOutreachQueueItems.contactId,
      queueStatus: prospectOutreachQueueItems.queueStatus,
      attempts: prospectOutreachQueueItems.attempts,
      lastError: prospectOutreachQueueItems.lastError,
      senderMailboxId: prospectOutreachQueueItems.senderMailboxId,
      selectedChannel: prospectOutreachQueueItems.selectedChannel,
      recipientIdentity: prospectOutreachQueueItems.recipientIdentity,
      scheduledAt: prospectOutreachQueueItems.scheduledAt,
      startedAt: prospectOutreachQueueItems.startedAt,
      sentAt: prospectOutreachQueueItems.sentAt,
      createdAt: prospectOutreachQueueItems.createdAt,
      updatedAt: prospectOutreachQueueItems.updatedAt,
      name: contacts.name,
    })
    .from(prospectOutreachQueueItems)
    .leftJoin(contacts, eq(contacts.id, prospectOutreachQueueItems.contactId))
    .where(
      and(
        eq(prospectOutreachQueueItems.workspaceUserId, wid),
        ilike(contacts.name, "%delicious%digital%"),
      ),
    )
    .orderBy(desc(prospectOutreachQueueItems.updatedAt))
    .limit(5);

  const recent = await db
    .select({
      id: prospectOutreachQueueItems.id,
      name: contacts.name,
      queueStatus: prospectOutreachQueueItems.queueStatus,
      attempts: prospectOutreachQueueItems.attempts,
      lastError: prospectOutreachQueueItems.lastError,
      senderMailboxId: prospectOutreachQueueItems.senderMailboxId,
      sentAt: prospectOutreachQueueItems.sentAt,
      updatedAt: prospectOutreachQueueItems.updatedAt,
      scheduledAt: prospectOutreachQueueItems.scheduledAt,
    })
    .from(prospectOutreachQueueItems)
    .leftJoin(contacts, eq(contacts.id, prospectOutreachQueueItems.contactId))
    .where(
      and(
        eq(prospectOutreachQueueItems.workspaceUserId, wid),
        inArray(prospectOutreachQueueItems.queueStatus, [
          "queued",
          "sending",
          "paused",
          "failed",
          "sent",
        ]),
      ),
    )
    .orderBy(desc(prospectOutreachQueueItems.updatedAt))
    .limit(25);

  const mailboxes = await db
    .select({
      id: emailMailboxes.id,
      emailAddress: emailMailboxes.emailAddress,
      syncStatus: emailMailboxes.syncStatus,
      syncError: emailMailboxes.syncError,
      isPrimary: emailMailboxes.isPrimary,
      tokenExpiresAt: emailMailboxes.tokenExpiresAt,
      lastSyncAt: emailMailboxes.lastSyncAt,
      updatedAt: emailMailboxes.updatedAt,
      hasAccess: sql<boolean>`(${emailMailboxes.accessTokenEncrypted} is not null and length(${emailMailboxes.accessTokenEncrypted}) > 0)`,
      hasRefresh: sql<boolean>`(${emailMailboxes.refreshTokenEncrypted} is not null and length(${emailMailboxes.refreshTokenEncrypted}) > 0)`,
    })
    .from(emailMailboxes)
    .where(eq(emailMailboxes.workspaceUserId, wid));

  const primary = mailboxes.find((m) => m.isPrimary) || mailboxes[0] || null;
  const d0 = delicious[0];
  const displayError = d0?.lastError
    ? formatProspectQueueItemError(d0.lastError)
    : null;

  const tokenExpiresMs = primary?.tokenExpiresAt?.getTime() ?? null;
  const tokenExpiredOrNear =
    tokenExpiresMs == null ? null : tokenExpiresMs < now + 60_000;

  console.log(
    JSON.stringify(
      {
        note: "read_only_no_decrypt_no_probe_no_mutate",
        workspaceIdPrefix: wid.slice(0, 8),
        nowIso: new Date(now).toISOString(),
        queueSettings: s
          ? {
              paused: s.paused,
              queueRunning: s.queueRunning,
              armed: isProspectOutreachQueueArmed({
                queueRunning: s.queueRunning,
                paused: s.paused,
              }),
              dailySendLimit: s.dailySendLimit,
              hourlySendLimit: s.hourlySendLimit,
              updatedAt: s.updatedAt?.toISOString?.() ?? s.updatedAt,
            }
          : null,
        delicious: delicious.map((r) => ({
          name: r.name,
          idPrefix: r.id.slice(0, 8),
          queueStatus: r.queueStatus,
          attempts: r.attempts,
          lastErrorRaw: r.lastError,
          lastErrorDisplay: r.lastError
            ? formatProspectQueueItemError(r.lastError)
            : null,
          senderMailboxIdPrefix: r.senderMailboxId?.slice(0, 8) ?? null,
          selectedChannel: r.selectedChannel,
          recipientHasAt: Boolean(r.recipientIdentity?.includes("@")),
          scheduledAt: r.scheduledAt?.toISOString() ?? null,
          startedAt: r.startedAt?.toISOString() ?? null,
          sentAt: r.sentAt?.toISOString() ?? null,
          updatedAt: r.updatedAt?.toISOString() ?? null,
        })),
        deliciousPrimaryDisplayError: displayError,
        gmailMailboxSnapshot: mailboxes.map((m) => ({
          idPrefix: m.id.slice(0, 8),
          email: m.emailAddress,
          isPrimary: m.isPrimary,
          syncStatus: m.syncStatus,
          syncError: m.syncError,
          sendableByStatus: isEmailMailboxSyncStatusSendable(m.syncStatus),
          hasAccessCiphertext: Boolean(m.hasAccess),
          hasRefreshCiphertext: Boolean(m.hasRefresh),
          tokenExpiresAt: m.tokenExpiresAt?.toISOString() ?? null,
          tokenExpiredOrWithin60s: m.tokenExpiresAt
            ? m.tokenExpiresAt.getTime() < now + 60_000
            : null,
          lastSyncAt: m.lastSyncAt?.toISOString() ?? null,
          updatedAt: m.updatedAt?.toISOString() ?? null,
        })),
        workerWouldSeePrimary: primary
          ? {
              syncStatus: primary.syncStatus,
              sendableByStatus: isEmailMailboxSyncStatusSendable(primary.syncStatus),
              syncError: primary.syncError,
              tokenExpiredOrWithin60s: tokenExpiredOrNear,
              // Without live decrypt we cannot assert emailConnected; only status+ciphertext.
              ciphertextPresent: Boolean(primary.hasAccess && primary.hasRefresh),
            }
          : { missing: true },
        recentQueueTimeline: recent.map((r) => ({
          name: r.name,
          status: r.queueStatus,
          attempts: r.attempts,
          lastError: r.lastError,
          senderPrefix: r.senderMailboxId?.slice(0, 8) ?? null,
          sentAt: r.sentAt?.toISOString() ?? null,
          updatedAt: r.updatedAt?.toISOString() ?? null,
          scheduledAt: r.scheduledAt?.toISOString() ?? null,
        })),
        statusCounts: recent.reduce(
          (acc, r) => {
            acc[r.queueStatus] = (acc[r.queueStatus] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
      },
      null,
      2,
    ),
  );

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
