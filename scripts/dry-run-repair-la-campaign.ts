/**
 * DRY-RUN ONLY — prepares repair plan for the LA 44-prospect campaign.
 * Does NOT apply any mutations.
 *
 * Run: npx tsx scripts/dry-run-repair-la-campaign.ts
 */
import "dotenv/config";
import { asc, eq } from "drizzle-orm";
import { writeFileSync } from "node:fs";
import { db } from "../drizzle/db";
import {
  contacts,
  emailMailboxes,
  prospectOutreachBatches,
  prospectOutreachQueueItems,
  prospectOutreachSettings,
} from "../shared/schema";
import { resolveProspectImportDestinationUserId } from "../server/prospectImport/prospectImportService";
import { isSenderNotConnectedFailure } from "../shared/prospectOutreachFailureScope";
import { filterQueueItemsForStaleSenderErrorClear } from "../shared/prospectOutreachFailureScope";
import { isEmailMailboxUiConnected } from "../shared/emailMailboxAvailability";
import { resolveEmailSenderForBulkOutreach } from "../server/prospectImport/prospectOutreachEligibilityService";

const TARGET_BATCH_ID = "b41d623f-a1c4-40fd-958c-7a4f507dd40a";

async function main() {
  const wid = await resolveProspectImportDestinationUserId();
  const [batch] = await db
    .select()
    .from(prospectOutreachBatches)
    .where(eq(prospectOutreachBatches.id, TARGET_BATCH_ID))
    .limit(1);

  if (!batch) {
    console.error("Batch not found:", TARGET_BATCH_ID);
    process.exit(1);
  }

  const items = await db
    .select({
      id: prospectOutreachQueueItems.id,
      name: contacts.name,
      queueStatus: prospectOutreachQueueItems.queueStatus,
      scheduledAt: prospectOutreachQueueItems.scheduledAt,
      createdAt: prospectOutreachQueueItems.createdAt,
      sentAt: prospectOutreachQueueItems.sentAt,
      lastError: prospectOutreachQueueItems.lastError,
      senderMailboxId: prospectOutreachQueueItems.senderMailboxId,
      subjectSnapshot: prospectOutreachQueueItems.subjectSnapshot,
      messageSnapshot: prospectOutreachQueueItems.messageSnapshot,
    })
    .from(prospectOutreachQueueItems)
    .leftJoin(contacts, eq(contacts.id, prospectOutreachQueueItems.contactId))
    .where(eq(prospectOutreachQueueItems.batchId, TARGET_BATCH_ID))
    .orderBy(asc(prospectOutreachQueueItems.scheduledAt));

  const [settings] = await db
    .select()
    .from(prospectOutreachSettings)
    .where(eq(prospectOutreachSettings.workspaceUserId, wid))
    .limit(1);

  const [mailbox] = await db
    .select()
    .from(emailMailboxes)
    .where(eq(emailMailboxes.workspaceUserId, wid))
    .limit(1);

  const live = await resolveEmailSenderForBulkOutreach(wid).catch((err) => ({
    emailConnected: false,
    emailMailboxId: null as string | null,
    failureClass: "probe_threw",
    error: err instanceof Error ? err.message : String(err),
  }));

  const sent = items.filter((i) => i.queueStatus === "sent" || Boolean(i.sentAt));
  const withDrafts = items.filter(
    (i) => String(i.subjectSnapshot || "").trim() && String(i.messageSnapshot || "").trim(),
  );
  const staleClearCandidates = filterQueueItemsForStaleSenderErrorClear(
    items.map((i) => ({
      lastError: i.lastError,
      queueStatus: i.queueStatus,
      senderMailboxId: i.senderMailboxId,
      id: i.id,
    })),
    mailbox?.id || "unknown",
  );

  const proposed = {
    apply: false,
    safeToRepair: sent.length === 0,
    warnings: [
      sent.length > 0
        ? "Preserving sent rows — would not reorder or rewrite sent messages."
        : "No sent messages — full draft reorder/status repair is safe.",
      !isEmailMailboxUiConnected(mailbox?.syncStatus)
        ? "Mailbox syncStatus is not UI-connected; clear stale sender errors only after live probe succeeds."
        : "Mailbox UI status looks connected.",
      live.emailConnected
        ? "Live sender probe OK — stale sender_not_connected errors may be cleared on Start."
        : "Live sender probe failed in this environment — do not clear errors until production probe succeeds.",
    ],
    current: {
      campaignId: batch.id,
      batchStatus: batch.status,
      queueRunning: settings?.queueRunning ?? null,
      paused: settings?.paused ?? null,
      mailboxSyncStatus: mailbox?.syncStatus ?? null,
      mailboxEmail: mailbox?.emailAddress ?? null,
      liveEmailConnected: live.emailConnected,
      itemCount: items.length,
      sentCount: sent.length,
      draftSnapshotCount: withDrafts.length,
      staleSenderErrorCount: items.filter((i) => isSenderNotConnectedFailure(i.lastError)).length,
      queueOrderByScheduledAt: items.map((i, idx) => ({
        idx,
        id: i.id,
        name: i.name,
        scheduledAt: i.scheduledAt,
        status: i.queueStatus,
        lastError: i.lastError,
      })),
    },
    proposedMutations: [
      {
        op: "update_batch_status",
        batchId: batch.id,
        from: batch.status,
        to: "draft",
        reason: "New campaign never started sending — return to Draft with Start Sending.",
      },
      {
        op: "update_outreach_settings",
        from: { queueRunning: settings?.queueRunning, paused: settings?.paused },
        to: { queueRunning: false, paused: false },
        reason: "Clear sticky pause so UI shows Start Sending, not Resume.",
      },
      {
        op: "preserve_scheduledAt_order",
        note: "Keep existing scheduledAt ASC sequence (already correct for worker). UI sort will match.",
        first: items[0]?.name ?? null,
        last: items[items.length - 1]?.name ?? null,
      },
      {
        op: "preserve_drafts",
        count: withDrafts.length,
        note: "Do not rewrite subject/message snapshots in this repair.",
      },
      {
        op: "preserve_sent",
        count: sent.length,
        note: "No sent rows to preserve in this batch.",
      },
      {
        op: "clear_stale_sender_errors_if_live_ok",
        candidateIds: staleClearCandidates.map((c) => c.id),
        condition: "Only when resolveEmailSenderForBulkOutreach.emailConnected === true",
        liveEmailConnected: live.emailConnected,
      },
    ],
  };

  writeFileSync("dry-run-repair-la-campaign-out.json", JSON.stringify(proposed, null, 2), "utf8");
  console.log("Wrote dry-run-repair-la-campaign-out.json (apply=false)");
  console.log(
    JSON.stringify(
      {
        campaignId: proposed.current.campaignId,
        sentCount: proposed.current.sentCount,
        safeToRepair: proposed.safeToRepair,
        proposedBatchStatus: "draft",
        proposedControls: { queueRunning: false, paused: false },
        staleClearCandidates: staleClearCandidates.length,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
