/**
 * READ-ONLY: diagnose campaign sender_not_connected vs Gmail Settings.
 * Does NOT send email or mutate queue/mailbox rows.
 * Run: npx tsx scripts/audit-campaign-sender-resolution.ts
 */
import "dotenv/config";
import { and, desc, eq, ilike } from "drizzle-orm";
import { db } from "../drizzle/db";
import {
  contacts,
  emailMailboxes,
  prospectOutreachQueueItems,
  prospectOutreachSettings,
} from "../shared/schema";
import { resolveProspectImportDestinationUserId } from "../server/prospectImport/prospectImportService";
import { getPrimaryEmailMailbox, listEmailMailboxes } from "../server/emailChannel/mailboxStore";
import { isEmailMailboxSyncStatusSendable } from "../shared/emailMailboxAvailability";
import { resolveEmailSenderForBulkOutreach } from "../server/prospectImport/prospectOutreachEligibilityService";

async function main() {
  const wid = await resolveProspectImportDestinationUserId();

  const settings = await db
    .select()
    .from(prospectOutreachSettings)
    .where(eq(prospectOutreachSettings.workspaceUserId, wid))
    .limit(1);

  const mailboxes = await listEmailMailboxes(wid);
  const primary = await getPrimaryEmailMailbox(wid);
  const bulk = await resolveEmailSenderForBulkOutreach(wid);

  const uncommon = await db
    .select({
      id: prospectOutreachQueueItems.id,
      contactId: prospectOutreachQueueItems.contactId,
      queueStatus: prospectOutreachQueueItems.queueStatus,
      attempts: prospectOutreachQueueItems.attempts,
      lastError: prospectOutreachQueueItems.lastError,
      senderMailboxId: prospectOutreachQueueItems.senderMailboxId,
      selectedChannel: prospectOutreachQueueItems.selectedChannel,
      recipientIdentity: prospectOutreachQueueItems.recipientIdentity,
      name: contacts.name,
      updatedAt: prospectOutreachQueueItems.updatedAt,
    })
    .from(prospectOutreachQueueItems)
    .leftJoin(contacts, eq(contacts.id, prospectOutreachQueueItems.contactId))
    .where(
      and(
        eq(prospectOutreachQueueItems.workspaceUserId, wid),
        ilike(contacts.name, "%common%logic%"),
      ),
    )
    .orderBy(desc(prospectOutreachQueueItems.updatedAt))
    .limit(5);

  const snapMailboxIds = [
    ...new Set(uncommon.map((r) => r.senderMailboxId).filter(Boolean) as string[]),
  ];
  const snapMailboxes = [];
  for (const id of snapMailboxIds) {
    const rows = await db.select().from(emailMailboxes).where(eq(emailMailboxes.id, id)).limit(1);
    const m = rows[0];
    snapMailboxes.push(
      m
        ? {
            id: m.id,
            emailAddress: m.emailAddress,
            syncStatus: m.syncStatus,
            isPrimary: m.isPrimary,
            workspaceUserId: m.workspaceUserId,
            sendableByStatus: isEmailMailboxSyncStatusSendable(m.syncStatus),
            hasAccessToken: Boolean(m.accessTokenEnc),
            hasRefreshToken: Boolean(m.refreshTokenEnc),
            sameWorkspaceAsCampaign: m.workspaceUserId === wid,
          }
        : { id, missing: true },
    );
  }

  // Also list ALL mailboxes that Settings might show for common user patterns
  // (same workspace only — no cross-workspace scan of secrets).
  console.log(
    JSON.stringify(
      {
        campaignWorkspaceUserIdPrefix: wid.slice(0, 8),
        settings: settings[0]
          ? {
              paused: settings[0].paused,
              queueRunning: settings[0].queueRunning,
            }
          : null,
        primaryMailbox: primary
          ? {
              idPrefix: primary.id.slice(0, 8),
              email: primary.emailAddress,
              syncStatus: primary.syncStatus,
              isPrimary: primary.isPrimary,
              sendableByStatus: isEmailMailboxSyncStatusSendable(primary.syncStatus),
              hasAccessToken: Boolean(primary.accessTokenEnc),
              hasRefreshToken: Boolean(primary.refreshTokenEnc),
            }
          : null,
        resolveEmailSenderForBulkOutreach: {
          emailConnected: bulk.emailConnected,
          emailMailboxIdPrefix: bulk.emailMailboxId?.slice(0, 8) || null,
        },
        allWorkspaceMailboxes: mailboxes.map((m) => ({
          idPrefix: m.id.slice(0, 8),
          email: m.emailAddress,
          syncStatus: m.syncStatus,
          isPrimary: m.isPrimary,
          sendableByStatus: isEmailMailboxSyncStatusSendable(m.syncStatus),
          hasAccessToken: Boolean(m.accessTokenEnc),
          hasRefreshToken: Boolean(m.refreshTokenEnc),
        })),
        uncommonLogicQueue: uncommon.map((r) => ({
          name: r.name,
          status: r.queueStatus,
          attempts: r.attempts,
          lastError: r.lastError,
          senderMailboxIdPrefix: r.senderMailboxId?.slice(0, 8) || null,
          selectedChannel: r.selectedChannel,
          recipient: r.recipientIdentity
            ? String(r.recipientIdentity).slice(0, 2) + "***@" + String(r.recipientIdentity).split("@")[1]
            : null,
          updatedAt: r.updatedAt?.toISOString() || null,
        })),
        snapshottedMailboxes: snapMailboxes,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
