/**
 * READ-ONLY: why campaign stayed paused after decrypt recovered.
 * No sends, no Resume, no mutations.
 * Run: npx tsx scripts/audit-campaign-stale-decrypt-pause.ts
 */
import "dotenv/config";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../drizzle/db";
import {
  contacts,
  emailMailboxes,
  prospectOutreachQueueItems,
  prospectOutreachSettings,
} from "../shared/schema";
import { resolveProspectImportDestinationUserId } from "../server/prospectImport/prospectImportService";
import { isProspectOutreachQueueArmed } from "../shared/prospectBulkOutreach";
import { resolveEmailSenderForBulkOutreach } from "../server/prospectImport/prospectOutreachEligibilityService";
import { parseSenderNotConnectedDiagnostic } from "../shared/prospectSenderProbeDiagnostics";
import {
  buildEmailCryptoKeyDiagSnapshot,
  probeMailboxTokensDecryptReadOnly,
} from "../server/emailChannel/credentials";

async function main() {
  const wid = await resolveProspectImportDestinationUserId();
  const keySnap = buildEmailCryptoKeyDiagSnapshot();

  const settingsRows = await db
    .select()
    .from(prospectOutreachSettings)
    .where(eq(prospectOutreachSettings.workspaceUserId, wid))
    .limit(1);
  const s = settingsRows[0];
  const settings = s
    ? {
        paused: s.paused,
        queueRunning: s.queueRunning,
        armed: isProspectOutreachQueueArmed({
          queueRunning: s.queueRunning,
          paused: s.paused,
        }),
      }
    : null;

  const mailboxes = await db
    .select()
    .from(emailMailboxes)
    .where(eq(emailMailboxes.workspaceUserId, wid));
  const primary = mailboxes.find((m) => m.isPrimary) || mailboxes[0];

  let liveProbe: Record<string, unknown> = { attempted: false };
  try {
    const live = await resolveEmailSenderForBulkOutreach(wid);
    liveProbe = {
      attempted: true,
      emailConnected: live.emailConnected,
      emailMailboxIdPrefix: live.emailMailboxId?.slice(0, 8) ?? null,
      failureClass: live.failureClass ?? null,
      reason: live.reason ?? null,
      detail: live.detail ?? null,
    };
  } catch (err) {
    liveProbe = {
      attempted: true,
      threw: true,
      error: err instanceof Error ? err.message.slice(0, 180) : String(err).slice(0, 180),
    };
  }

  const decryptProbe = primary
    ? probeMailboxTokensDecryptReadOnly({
        accessTokenEncrypted: primary.accessTokenEncrypted,
        refreshTokenEncrypted: primary.refreshTokenEncrypted,
      })
    : null;

  const active = await db
    .select({
      id: prospectOutreachQueueItems.id,
      name: contacts.name,
      queueStatus: prospectOutreachQueueItems.queueStatus,
      attempts: prospectOutreachQueueItems.attempts,
      lastError: prospectOutreachQueueItems.lastError,
      scheduledAt: prospectOutreachQueueItems.scheduledAt,
      sentAt: prospectOutreachQueueItems.sentAt,
      senderMailboxId: prospectOutreachQueueItems.senderMailboxId,
      updatedAt: prospectOutreachQueueItems.updatedAt,
      batchId: prospectOutreachQueueItems.batchId,
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
        ]),
      ),
    )
    .orderBy(asc(prospectOutreachQueueItems.scheduledAt));

  const withDecryptErr = active.filter((r) =>
    /sender_not_connected:decrypt/i.test(String(r.lastError || "")),
  );

  const recentSent = await db
    .select({
      name: contacts.name,
      sentAt: prospectOutreachQueueItems.sentAt,
      senderMailboxId: prospectOutreachQueueItems.senderMailboxId,
    })
    .from(prospectOutreachQueueItems)
    .leftJoin(contacts, eq(contacts.id, prospectOutreachQueueItems.contactId))
    .where(
      and(
        eq(prospectOutreachQueueItems.workspaceUserId, wid),
        eq(prospectOutreachQueueItems.queueStatus, "sent"),
      ),
    )
    .orderBy(desc(prospectOutreachQueueItems.sentAt))
    .limit(5);

  console.log(
    JSON.stringify(
      {
        note: "READ-ONLY. Explains campaign block after decrypt recovery. Local keySnap may differ from Railway.",
        workspaceIdPrefix: wid.slice(0, 8),
        localKeySnap: {
          keySource: keySnap.keySource,
          keyFp8: keySnap.keyFp8,
          emailEncryptionKeyPresent: keySnap.emailEncryptionKeyPresent,
          nodeEnv: keySnap.nodeEnv,
        },
        campaignControl: settings,
        mailbox: primary
          ? {
              idPrefix: primary.id.slice(0, 8),
              email: primary.emailAddress,
              syncStatus: primary.syncStatus,
              syncErrorPreview: primary.syncError
                ? String(primary.syncError).slice(0, 160)
                : null,
              tokenExpiresAt: primary.tokenExpiresAt?.toISOString() ?? null,
              lastSyncAt: primary.lastSyncAt?.toISOString() ?? null,
              updatedAt: primary.updatedAt?.toISOString() ?? null,
              decryptProbe,
            }
          : null,
        liveSenderProbe: liveProbe,
        activeRows: active.map((r) => ({
          name: r.name,
          status: r.queueStatus,
          attempts: r.attempts,
          lastError: r.lastError,
          parsed: parseSenderNotConnectedDiagnostic(r.lastError),
          senderPrefix: r.senderMailboxId?.slice(0, 8) ?? null,
          updatedAt: r.updatedAt?.toISOString() ?? null,
          scheduledAt: r.scheduledAt?.toISOString() ?? null,
          batchPrefix: r.batchId?.slice(0, 8) ?? null,
        })),
        rowsStillCarryingDecryptError: withDecryptErr.map((r) => ({
          name: r.name,
          status: r.queueStatus,
          lastError: r.lastError,
          updatedAt: r.updatedAt?.toISOString() ?? null,
        })),
        recentSent: recentSent.map((r) => ({
          name: r.name,
          sentAt: r.sentAt?.toISOString() ?? null,
          senderPrefix: r.senderMailboxId?.slice(0, 8) ?? null,
        })),
        rootCauseChecklist: {
          globalPauseBlocksClaims:
            "Worker only claims when queueRunning && !paused (isProspectOutreachQueueArmed).",
          rowLastErrorIsStickyUntilCleared:
            "Infra pause releases item to queued WITH lastError persisted; Resume does not clear lastError on Ready rows.",
          uiShowsRowErrorEvenWhenCampaignArmed:
            "formatProspectQueueItemError(lastError) displays reconnect copy while status remains Ready.",
          liveProbeVsRowError:
            "If liveSenderProbe.emailConnected=true but campaignControl.paused=true, block is control-plane pause, not current decrypt failure.",
        },
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
