/**
 * Durable channel-agnostic prospect outreach queue.
 * Snapshots approved subject/body at queue time.
 * Sending goes through existing channelService / EmailProspectOutreachSender.
 */

import { and, desc, eq, inArray, lte, or, sql } from "drizzle-orm";
import {
  contacts,
  prospectIntelligence,
  prospectOutreachBatches,
  prospectOutreachQueueItems,
  prospectOutreachSettings,
  type ProspectOutreachQueueItemRow,
  type ProspectOutreachBatchRow,
} from "@shared/schema";
import {
  PROSPECT_OUTREACH_DEFAULT_SETTINGS,
  buildQueueDedupKey,
  buildStaggeredQueueSchedule,
  computeNextScheduledDelayMs,
  isProspectOutreachQueueArmed,
  nextProspectQueueControlFlags,
  nextQueueItemAfterInfraPause,
  normalizeRecipientIdentity,
  prospectBulkOutreachLog,
  prospectOutreachEligibilityReasonLabel,
  type ProspectOutreachBatchSummary,
  type ProspectOutreachChannel,
  type ProspectOutreachPreferredChannel,
  type ProspectOutreachQueueDashboard,
  type ProspectOutreachQueueItemSummary,
  type ProspectOutreachQueuePreview,
  type ProspectOutreachWorkspaceSettings,
} from "@shared/prospectBulkOutreach";
import {
  formatSenderNotConnectedDiagnostic,
  isSenderNotConnectedReason,
  parseSenderNotConnectedDiagnostic,
  prospectSenderProbeDiagLog,
  type ProspectSenderProbeFailureClass,
  PROSPECT_SENDER_PROBE_FAILURE_CLASSES,
} from "@shared/prospectSenderProbeDiagnostics";
import { buildProspectOutreachSubject } from "@shared/prospectContactEnrichment";
import { db } from "../../drizzle/db";
import { storage } from "../storage";
import { resolveProspectImportDestinationUserId } from "./prospectImportService";
import {
  loadWorkspaceChannelConnections,
  resolveProspectOutreachEligibilityForContact,
  recipientIdentityForSelectedChannel,
} from "./prospectOutreachEligibilityService";
import { getProspectOutreachSender } from "./prospectOutreachSenders";

function failureClassFromEligibilityDetail(
  detail: string | null | undefined,
): ProspectSenderProbeFailureClass {
  const d = String(detail || "").trim().toLowerCase();
  if ((PROSPECT_SENDER_PROBE_FAILURE_CLASSES as readonly string[]).includes(d)) {
    return d as ProspectSenderProbeFailureClass;
  }
  return "other_probe_failure";
}
function mapSettings(
  row: typeof prospectOutreachSettings.$inferSelect | undefined,
): ProspectOutreachWorkspaceSettings {
  if (!row) {
    return {
      preferredChannel: PROSPECT_OUTREACH_DEFAULT_SETTINGS.preferredChannel,
      dailySendLimit: PROSPECT_OUTREACH_DEFAULT_SETTINGS.dailySendLimit,
      minDelaySeconds: PROSPECT_OUTREACH_DEFAULT_SETTINGS.minDelaySeconds,
      maxDelaySeconds: PROSPECT_OUTREACH_DEFAULT_SETTINGS.maxDelaySeconds,
      hourlySendLimit: PROSPECT_OUTREACH_DEFAULT_SETTINGS.hourlySendLimit,
      queueRunning: PROSPECT_OUTREACH_DEFAULT_SETTINGS.queueRunning,
      paused: PROSPECT_OUTREACH_DEFAULT_SETTINGS.paused,
    };
  }
  return {
    preferredChannel: row.preferredChannel as ProspectOutreachPreferredChannel,
    dailySendLimit: row.dailySendLimit,
    minDelaySeconds: row.minDelaySeconds,
    maxDelaySeconds: row.maxDelaySeconds,
    hourlySendLimit: row.hourlySendLimit,
    queueRunning: row.queueRunning ?? false,
    paused: row.paused,
    updatedAt: row.updatedAt?.toISOString(),
  };
}

function mapBatch(row: ProspectOutreachBatchRow): ProspectOutreachBatchSummary {
  return {
    id: row.id,
    workspaceUserId: row.workspaceUserId,
    status: row.status as ProspectOutreachBatchSummary["status"],
    preferredChannel: row.preferredChannel as ProspectOutreachPreferredChannel,
    selectedCount: row.selectedCount,
    queuedCount: row.queuedCount,
    skippedCount: row.skippedCount,
    sentCount: row.sentCount,
    failedCount: row.failedCount,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdByUserId: row.createdByUserId,
  };
}

function mapQueueItem(
  row: ProspectOutreachQueueItemRow,
  prospectName?: string | null,
): ProspectOutreachQueueItemSummary {
  return {
    id: row.id,
    batchId: row.batchId,
    workspaceUserId: row.workspaceUserId,
    contactId: row.contactId,
    prospectName: prospectName ?? null,
    selectedChannel: row.selectedChannel as ProspectOutreachChannel,
    recipientIdentity: row.recipientIdentity,
    subjectSnapshot: row.subjectSnapshot,
    recommendedOffer: row.recommendedOffer,
    outreachAngle: row.outreachAngle,
    queueStatus: row.queueStatus as ProspectOutreachQueueItemSummary["queueStatus"],
    attempts: row.attempts,
    lastError: row.lastError,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    startedAt: row.startedAt?.toISOString() ?? null,
    sentAt: row.sentAt?.toISOString() ?? null,
    conversationId: row.conversationId,
    messageId: row.messageId,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    historySource: "queue",
  };
}

export async function getOutreachSettings(
  workspaceUserId?: string,
): Promise<ProspectOutreachWorkspaceSettings> {
  const wid = workspaceUserId || (await resolveProspectImportDestinationUserId());
  const rows = await db
    .select()
    .from(prospectOutreachSettings)
    .where(eq(prospectOutreachSettings.workspaceUserId, wid))
    .limit(1);
  return mapSettings(rows[0]);
}

export async function updateOutreachSettings(
  workspaceUserId: string,
  patch: Partial<ProspectOutreachWorkspaceSettings>,
): Promise<ProspectOutreachWorkspaceSettings> {
  const current = await getOutreachSettings(workspaceUserId);
  const next = {
    preferredChannel: patch.preferredChannel ?? current.preferredChannel,
    dailySendLimit: Math.max(1, Math.min(200, patch.dailySendLimit ?? current.dailySendLimit)),
    hourlySendLimit: Math.max(1, Math.min(30, patch.hourlySendLimit ?? current.hourlySendLimit)),
    minDelaySeconds: Math.max(5, patch.minDelaySeconds ?? current.minDelaySeconds),
    maxDelaySeconds: Math.max(
      Math.max(5, patch.minDelaySeconds ?? current.minDelaySeconds),
      patch.maxDelaySeconds ?? current.maxDelaySeconds,
    ),
    queueRunning: patch.queueRunning ?? current.queueRunning,
    paused: patch.paused ?? current.paused,
  };

  await db
    .insert(prospectOutreachSettings)
    .values({
      workspaceUserId,
      ...next,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: prospectOutreachSettings.workspaceUserId,
      set: { ...next, updatedAt: new Date() },
    });

  return { ...next, updatedAt: new Date().toISOString() };
}

export async function previewQueueBatch(params: {
  contactIds: string[];
  preferredChannel?: ProspectOutreachPreferredChannel;
  workspaceUserId?: string;
}): Promise<ProspectOutreachQueuePreview> {
  const workspaceUserId =
    params.workspaceUserId || (await resolveProspectImportDestinationUserId());
  const settings = await getOutreachSettings(workspaceUserId);
  const preferred = params.preferredChannel || settings.preferredChannel;
  const connections = await loadWorkspaceChannelConnections(workspaceUserId);

  const uniqueIds = Array.from(new Set(params.contactIds.filter(Boolean)));
  const skips: ProspectOutreachQueuePreview["skips"] = [];
  const eligibleByChannel: Partial<Record<ProspectOutreachChannel, number>> = {};
  let willQueue = 0;
  let notBulkEligible = 0;
  const seenRecipients = new Set<string>();

  for (const contactId of uniqueIds) {
    const contact = await storage.getContact(contactId);
    if (!contact) {
      skips.push({
        contactId,
        reason: "missing_identity",
        detail: "contact_not_found",
        reasonLabel: prospectOutreachEligibilityReasonLabel("missing_identity", "contact_not_found"),
      });
      continue;
    }
    if (contact.userId !== workspaceUserId) {
      skips.push({
        contactId,
        reason: "missing_identity",
        detail: "wrong_workspace",
        reasonLabel: prospectOutreachEligibilityReasonLabel("missing_identity", "wrong_workspace"),
      });
      continue;
    }
    const { result, priorOutreach } = await resolveProspectOutreachEligibilityForContact({
      contact,
      workspaceUserId,
      preferredChannel: preferred,
      connections,
    });
    if (!result.anyEligible || !result.selectedChannel) {
      const reason = result.summaryReason || result.channels.email?.reason || "not_enabled_for_bulk";
      const detail = result.channels.email?.detail;
      const skip = {
        contactId,
        name: contact.name,
        reason,
        detail,
        reasonLabel: prospectOutreachEligibilityReasonLabel(reason, detail),
      };
      if (
        reason === "already_outreach_sent" ||
        reason === "already_replied" ||
        reason === "needs_review" ||
        reason === "not_approved" ||
        reason === "duplicate_queued" ||
        reason === "suppressed" ||
        reason === "opted_out" ||
        reason === "analysis_incomplete" ||
        isSenderNotConnectedReason(reason) ||
        reason === "missing_identity" ||
        reason === "missing_message_snapshot"
      ) {
        skips.push(skip);
      } else {
        notBulkEligible += 1;
        skips.push(skip);
      }
      continue;
    }

    const recipient = recipientIdentityForSelectedChannel(result.selectedChannel, contact);
    if (!recipient) {
      skips.push({
        contactId,
        name: contact.name,
        reason: "missing_identity",
        reasonLabel: prospectOutreachEligibilityReasonLabel("missing_identity", "missing_email"),
      });
      continue;
    }
    const recipientKey = `${result.selectedChannel}:${recipient}`;
    if (seenRecipients.has(recipientKey)) {
      skips.push({
        contactId,
        name: contact.name,
        reason: "duplicate_recipient",
        reasonLabel: prospectOutreachEligibilityReasonLabel("duplicate_recipient"),
      });
      continue;
    }

    const piRows = await db
      .select()
      .from(prospectIntelligence)
      .where(eq(prospectIntelligence.contactId, contactId))
      .limit(1);
    const message = String(piRows[0]?.suggestedFirstMessage || "").trim();
    if (!message) {
      skips.push({
        contactId,
        name: contact.name,
        reason: "missing_message_snapshot",
        reasonLabel: prospectOutreachEligibilityReasonLabel("missing_message_snapshot"),
      });
      continue;
    }

    seenRecipients.add(recipientKey);
    willQueue += 1;
    eligibleByChannel[result.selectedChannel] =
      (eligibleByChannel[result.selectedChannel] || 0) + 1;
  }

  return {
    selectedCount: uniqueIds.length,
    willQueue,
    eligibleByChannel,
    notBulkEligible,
    skips,
    preferredChannel: preferred,
  };
}

export async function createQueueBatch(params: {
  contactIds: string[];
  createdByUserId: string;
  preferredChannel?: ProspectOutreachPreferredChannel;
  workspaceUserId?: string;
  /** Client idempotency token to collapse double-clicks (optional). */
  idempotencyKey?: string;
}): Promise<{
  batch: ProspectOutreachBatchSummary;
  preview: ProspectOutreachQueuePreview;
  queuedItemIds: string[];
}> {
  const workspaceUserId =
    params.workspaceUserId || (await resolveProspectImportDestinationUserId());
  const settings = await getOutreachSettings(workspaceUserId);
  const preferred = params.preferredChannel || settings.preferredChannel;
  const preview = await previewQueueBatch({
    contactIds: params.contactIds,
    preferredChannel: preferred,
    workspaceUserId,
  });

  const connections = await loadWorkspaceChannelConnections(workspaceUserId);
  const [batch] = await db
    .insert(prospectOutreachBatches)
    .values({
      workspaceUserId,
      createdByUserId: params.createdByUserId,
      status: "queued",
      preferredChannel: preferred,
      selectedCount: preview.selectedCount,
      queuedCount: 0,
      skippedCount: preview.skips.length + preview.notBulkEligible,
      skipSummary: {
        skips: preview.skips.slice(0, 100),
        eligibleByChannel: preview.eligibleByChannel,
        notBulkEligible: preview.notBulkEligible,
        idempotencyKey: params.idempotencyKey || null,
      },
    })
    .returning();

  console.info(
    JSON.stringify(
      prospectBulkOutreachLog("queue_batch_created", {
        workspaceId: workspaceUserId,
        batchId: batch.id,
        status: "queued",
        selectedChannel: preferred,
      }),
    ),
  );

  const queuedItemIds: string[] = [];
  const queuedContactIds: string[] = [];
  const seenRecipients = new Set<string>();
  let delayCursor = Date.now() + 5_000; // first send shortly after queue start
  let queuedCount = 0;

  for (const contactId of Array.from(new Set(params.contactIds.filter(Boolean)))) {
    const contact = await storage.getContact(contactId);
    if (!contact) {
      console.info(
        JSON.stringify(
          prospectBulkOutreachLog("prospect_skipped", {
            workspaceId: workspaceUserId,
            batchId: batch.id,
            contactId,
            reason: "contact_not_found",
          }),
        ),
      );
      continue;
    }

    const { result, mailboxId } = await resolveProspectOutreachEligibilityForContact({
      contact,
      workspaceUserId,
      preferredChannel: preferred,
      connections,
    });

    if (!result.anyEligible || !result.selectedChannel) {
      console.info(
        JSON.stringify(
          prospectBulkOutreachLog("prospect_skipped", {
            workspaceId: workspaceUserId,
            batchId: batch.id,
            contactId,
            reason: result.summaryReason || "eligibility_rejected",
          }),
        ),
      );
      console.info(
        JSON.stringify(
          prospectBulkOutreachLog("eligibility_rejected", {
            workspaceId: workspaceUserId,
            batchId: batch.id,
            contactId,
            reason: result.summaryReason || "eligibility_rejected",
          }),
        ),
      );
      continue;
    }

    const channel = result.selectedChannel;
    const recipient = recipientIdentityForSelectedChannel(channel, contact);
    if (!recipient) continue;

    const recipientKey = `${channel}:${recipient}`;
    if (seenRecipients.has(recipientKey)) {
      console.info(
        JSON.stringify(
          prospectBulkOutreachLog("duplicate_blocked", {
            workspaceId: workspaceUserId,
            batchId: batch.id,
            contactId,
            selectedChannel: channel,
            reason: "duplicate_recipient",
          }),
        ),
      );
      continue;
    }

    const piRows = await db
      .select()
      .from(prospectIntelligence)
      .where(eq(prospectIntelligence.contactId, contactId))
      .limit(1);
    const pi = piRows[0];
    const messageSnapshot = String(pi?.suggestedFirstMessage || "").trim();
    if (!messageSnapshot) {
      console.info(
        JSON.stringify(
          prospectBulkOutreachLog("prospect_skipped", {
            workspaceId: workspaceUserId,
            batchId: batch.id,
            contactId,
            reason: "missing_message_snapshot",
          }),
        ),
      );
      continue;
    }

    const subjectSnapshot = buildProspectOutreachSubject(contact.name);
    const dedupKey = buildQueueDedupKey({
      workspaceUserId,
      contactId,
      channel,
      recipientIdentity: recipient,
    });

    try {
      const [item] = await db
        .insert(prospectOutreachQueueItems)
        .values({
          batchId: batch.id,
          workspaceUserId,
          contactId,
          selectedChannel: channel,
          senderMailboxId: channel === "email" ? mailboxId : null,
          recipientIdentity: recipient,
          recipientIdentityNormalized: normalizeRecipientIdentity(channel, recipient),
          subjectSnapshot,
          messageSnapshot,
          recommendedOffer: pi?.recommendedOffer ?? null,
          outreachAngle: pi?.suggestedOutreachAngle ?? null,
          queueStatus: "queued",
          dedupKey,
          sequenceStep: 1,
          scheduledAt: new Date(delayCursor),
        })
        .returning();

      seenRecipients.add(recipientKey);
      queuedItemIds.push(item.id);
      queuedContactIds.push(contactId);
      queuedCount += 1;
      delayCursor += computeNextScheduledDelayMs(settings);

      console.info(
        JSON.stringify(
          prospectBulkOutreachLog("prospect_queued", {
            workspaceId: workspaceUserId,
            batchId: batch.id,
            queueItemId: item.id,
            prospectIntelligenceId: contactId,
            contactId,
            selectedChannel: channel,
            status: "queued",
          }),
        ),
      );
    } catch (err) {
      // Unique index collision → duplicate active queue item
      console.info(
        JSON.stringify(
          prospectBulkOutreachLog("duplicate_blocked", {
            workspaceId: workspaceUserId,
            batchId: batch.id,
            contactId,
            selectedChannel: channel,
            reason: "dedup_key_collision",
          }),
        ),
      );
    }
  }

  await db
    .update(prospectOutreachBatches)
    .set({
      queuedCount,
      skippedCount: Math.max(0, preview.selectedCount - queuedCount),
    })
    .where(eq(prospectOutreachBatches.id, batch.id));

  // Phase 2: ensure website enrichment for queued prospects (async; skips if already done).
  if (queuedContactIds.length) {
    try {
      const { enqueueProspectEnrichmentForContacts } = await import("./prospectEnrichmentService");
      await enqueueProspectEnrichmentForContacts({
        contactIds: queuedContactIds,
        workspaceUserId,
        initiatedByUserId: params.createdByUserId,
        trigger: "queue",
      });
    } catch (err) {
      console.error(
        "[ProspectEnrichment] enqueue after queue failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  const refreshed = await db
    .select()
    .from(prospectOutreachBatches)
    .where(eq(prospectOutreachBatches.id, batch.id))
    .limit(1);

  return {
    batch: mapBatch(refreshed[0] || batch),
    preview: { ...preview, willQueue: queuedCount },
    queuedItemIds,
  };
}

export async function listQueueItems(params?: {
  workspaceUserId?: string;
  status?: string;
  limit?: number;
}): Promise<ProspectOutreachQueueItemSummary[]> {
  const workspaceUserId =
    params?.workspaceUserId || (await resolveProspectImportDestinationUserId());
  const limit = Math.min(Math.max(params?.limit ?? 100, 1), 500);

  const conditions = [eq(prospectOutreachQueueItems.workspaceUserId, workspaceUserId)];
  if (params?.status) {
    conditions.push(eq(prospectOutreachQueueItems.queueStatus, params.status));
  }

  const rows = await db
    .select({
      item: prospectOutreachQueueItems,
      name: contacts.name,
    })
    .from(prospectOutreachQueueItems)
    .leftJoin(contacts, eq(contacts.id, prospectOutreachQueueItems.contactId))
    .where(and(...conditions))
    .orderBy(desc(prospectOutreachQueueItems.createdAt))
    .limit(limit);

  const queueItems = rows.map((r) => mapQueueItem(r.item, r.name));
  const queuedContactIds = new Set(queueItems.map((i) => i.contactId));

  // Also include pre-queue Inbox outreach that has a linked message (findable history).
  // Status filters other than "all"/"sent" exclude these historical rows.
  const includeHistorical =
    !params?.status || params.status === "sent";

  let historical: ProspectOutreachQueueItemSummary[] = [];
  if (includeHistorical) {
    const { batchLoadPriorOutreachFlags } = await import(
      "./prospectOutreachEligibilityService"
    );
    const piRows = await db
      .select({
        contactId: prospectIntelligence.contactId,
        outreachStatus: prospectIntelligence.outreachStatus,
        outreachSentAt: prospectIntelligence.outreachSentAt,
        outreachMessageId: prospectIntelligence.outreachMessageId,
        outreachConversationId: prospectIntelligence.outreachConversationId,
        recommendedOffer: prospectIntelligence.recommendedOffer,
        outreachAngle: prospectIntelligence.suggestedOutreachAngle,
        name: contacts.name,
        email: contacts.email,
      })
      .from(prospectIntelligence)
      .innerJoin(contacts, eq(contacts.id, prospectIntelligence.contactId))
      .where(eq(contacts.userId, workspaceUserId))
      .limit(500);

    const priorByContact = await batchLoadPriorOutreachFlags(piRows.map((r) => r.contactId));

    for (const row of piRows) {
      if (queuedContactIds.has(row.contactId)) continue;
      const prior = priorByContact.get(row.contactId);
      if (!prior?.priorOutreachDetected) continue;

      const sentAt =
        prior.sentAt ||
        row.outreachSentAt?.toISOString() ||
        new Date().toISOString();
      const dayKey = sentAt.slice(0, 10);
      const subject =
        prior.subject ||
        (row.name ? `Idea for ${row.name}` : "Inbox outreach");
      historical.push({
        id: `inbox-outreach:${row.contactId}`,
        batchId: `inbox-outreach:${dayKey}`,
        workspaceUserId,
        contactId: row.contactId,
        prospectName: row.name,
        selectedChannel: "email",
        recipientIdentity: String(row.email || "").trim() || "—",
        subjectSnapshot: subject,
        recommendedOffer: row.recommendedOffer,
        outreachAngle: row.outreachAngle,
        queueStatus: "sent",
        attempts: 1,
        lastError: null,
        scheduledAt: null,
        startedAt: null,
        sentAt,
        conversationId: prior.conversationId || row.outreachConversationId,
        messageId: prior.messageId || row.outreachMessageId,
        createdAt: sentAt,
        historySource: "inbox_outreach",
      });
    }
  }

  const merged = [...queueItems, ...historical].sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt)),
  );
  return merged.slice(0, limit);
}

export async function getQueueDashboard(
  workspaceUserId?: string,
): Promise<ProspectOutreachQueueDashboard> {
  const wid = workspaceUserId || (await resolveProspectImportDestinationUserId());
  const settings = await getOutreachSettings(wid);
  const items = await db
    .select()
    .from(prospectOutreachQueueItems)
    .where(eq(prospectOutreachQueueItems.workspaceUserId, wid));

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  let queued = 0;
  let sending = 0;
  let sentToday = 0;
  let failed = 0;
  let paused = 0;

  for (const item of items) {
    const st = item.queueStatus;
    if (st === "queued") queued += 1;
    else if (st === "sending") sending += 1;
    else if (st === "failed") failed += 1;
    else if (st === "paused") paused += 1;
    if (st === "sent" && item.sentAt && item.sentAt >= dayStart) sentToday += 1;
  }

  const piRows = await db.select().from(prospectIntelligence);
  let outreachSentTotal = 0;
  let replied = 0;
  for (const row of piRows) {
    if (row.outreachStatus === "outreach_sent") outreachSentTotal += 1;
    if (row.outreachStatus === "replied") {
      outreachSentTotal += 1;
      replied += 1;
    }
  }

  return {
    queued,
    sending,
    sentToday,
    outreachSentTotal,
    replied,
    failed,
    paused,
    settings,
    queuePaused: settings.paused,
    queueRunning: settings.queueRunning,
  };
}

/**
 * After Start/Resume: restagger Ready (queued) items from now so processing
 * begins promptly and respects min/max delay. Clears stale lastError from
 * prior infra pauses. Does not send mail.
 */
export async function rescheduleQueuedOutreachItems(
  workspaceUserId: string,
): Promise<{ rescheduled: number; firstScheduledAt: string | null }> {
  const settings = await getOutreachSettings(workspaceUserId);
  const items = await db
    .select({
      id: prospectOutreachQueueItems.id,
    })
    .from(prospectOutreachQueueItems)
    .where(
      and(
        eq(prospectOutreachQueueItems.workspaceUserId, workspaceUserId),
        eq(prospectOutreachQueueItems.queueStatus, "queued"),
      ),
    )
    .orderBy(prospectOutreachQueueItems.scheduledAt);

  if (!items.length) {
    return { rescheduled: 0, firstScheduledAt: null };
  }

  const fromMs = Date.now();
  const stamps = buildStaggeredQueueSchedule({
    itemCount: items.length,
    fromMs,
    minDelaySeconds: settings.minDelaySeconds,
    maxDelaySeconds: settings.maxDelaySeconds,
    /** First Ready item is due immediately so wake() can claim on the same tick. */
    firstDelayMs: 0,
  });

  for (let i = 0; i < items.length; i++) {
    const at = new Date(stamps[i]!);
    await db
      .update(prospectOutreachQueueItems)
      .set({
        scheduledAt: at,
        lastError: null,
        startedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(prospectOutreachQueueItems.id, items[i]!.id));
  }

  return {
    rescheduled: items.length,
    firstScheduledAt: new Date(stamps[0]!).toISOString(),
  };
}

async function armQueueAndWake(workspaceUserId: string, reason: "start_queue" | "resume_queue") {
  const schedule = await rescheduleQueuedOutreachItems(workspaceUserId);
  console.info(
    JSON.stringify(
      prospectBulkOutreachLog("queue_resumed", {
        workspaceId: workspaceUserId,
        status: "running",
        reason,
        rescheduled: schedule.rescheduled,
        firstScheduledAt: schedule.firstScheduledAt,
      }),
    ),
  );
  try {
    const { wakeProspectOutreachQueueWorker } = await import("./prospectOutreachQueueWorker");
    wakeProspectOutreachQueueWorker();
  } catch (err) {
    console.error("[ProspectBulkOutreach] wake worker failed (non-fatal):", err);
  }
}

export async function pauseQueue(workspaceUserId: string): Promise<ProspectOutreachWorkspaceSettings> {
  // Global pause only — stop new claims via isProspectOutreachQueueArmed.
  // Do NOT bulk-rewrite Ready (queued) rows to paused; that made Start look like
  // it paused the entire campaign when the first infra failure called pauseQueue.
  const current = await getOutreachSettings(workspaceUserId);
  const flags = nextProspectQueueControlFlags("pause", current);
  const settings = await updateOutreachSettings(workspaceUserId, {
    paused: flags.paused,
    queueRunning: flags.queueRunning,
  });
  console.info(
    JSON.stringify(
      prospectBulkOutreachLog("queue_paused", {
        workspaceId: workspaceUserId,
        status: "paused",
        reason: "global_pause_only",
      }),
    ),
  );
  return settings;
}

export async function resumeQueue(workspaceUserId: string): Promise<ProspectOutreachWorkspaceSettings> {
  const { resolveEmailSenderForBulkOutreach } = await import("./prospectOutreachEligibilityService");
  const { PROSPECT_CAMPAIGN_CONNECT_EMAIL_MESSAGE } = await import("@shared/prospectBulkOutreach");
  const email = await resolveEmailSenderForBulkOutreach(workspaceUserId);
  if (!email.emailConnected || !email.emailMailboxId) {
    throw new Error(PROSPECT_CAMPAIGN_CONNECT_EMAIL_MESSAGE);
  }

  const flags = nextProspectQueueControlFlags("resume", {});
  const settings = await updateOutreachSettings(workspaceUserId, {
    paused: flags.paused,
    queueRunning: flags.queueRunning,
  });
  // Re-arm any rows left in item-level paused from older Pause behavior / infra paths.
  await db
    .update(prospectOutreachQueueItems)
    .set({ queueStatus: "queued", updatedAt: new Date() })
    .where(
      and(
        eq(prospectOutreachQueueItems.workspaceUserId, workspaceUserId),
        eq(prospectOutreachQueueItems.queueStatus, "paused"),
      ),
    );
  await db
    .update(prospectOutreachBatches)
    .set({ status: "running" })
    .where(
      and(
        eq(prospectOutreachBatches.workspaceUserId, workspaceUserId),
        inArray(prospectOutreachBatches.status, ["paused", "queued"]),
      ),
    );
  await armQueueAndWake(workspaceUserId, "resume_queue");
  return settings;
}

export async function startQueue(workspaceUserId: string): Promise<ProspectOutreachWorkspaceSettings> {
  // Fail closed before arming: never claim/send without a live outbound mailbox.
  const { resolveEmailSenderForBulkOutreach } = await import("./prospectOutreachEligibilityService");
  const { PROSPECT_CAMPAIGN_CONNECT_EMAIL_MESSAGE } = await import("@shared/prospectBulkOutreach");
  const email = await resolveEmailSenderForBulkOutreach(workspaceUserId);
  if (!email.emailConnected || !email.emailMailboxId) {
    throw new Error(PROSPECT_CAMPAIGN_CONNECT_EMAIL_MESSAGE);
  }

  const flags = nextProspectQueueControlFlags("start", {});
  const settings = await updateOutreachSettings(workspaceUserId, {
    queueRunning: flags.queueRunning,
    paused: flags.paused,
  });
  // Re-arm any items left paused from an earlier Pause / infra fail-closed path.
  await db
    .update(prospectOutreachQueueItems)
    .set({ queueStatus: "queued", updatedAt: new Date() })
    .where(
      and(
        eq(prospectOutreachQueueItems.workspaceUserId, workspaceUserId),
        eq(prospectOutreachQueueItems.queueStatus, "paused"),
      ),
    );
  await db
    .update(prospectOutreachBatches)
    .set({ status: "running", startedAt: new Date() })
    .where(
      and(
        eq(prospectOutreachBatches.workspaceUserId, workspaceUserId),
        inArray(prospectOutreachBatches.status, ["queued", "paused"]),
      ),
    );
  await armQueueAndWake(workspaceUserId, "start_queue");
  return settings;
}

/** Put a claimed in-flight item back to Ready after infra pause — no sibling mutation. */
async function releaseClaimedItemAfterInfraPause(
  item: ProspectOutreachQueueItemRow,
  reason: string,
): Promise<void> {
  const next = nextQueueItemAfterInfraPause({
    currentAttempts: item.attempts || 0,
    reason,
  });
  await db
    .update(prospectOutreachQueueItems)
    .set({
      queueStatus: next.queueStatus,
      attempts: next.attempts,
      lastError: next.lastError,
      startedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(prospectOutreachQueueItems.id, item.id));
}

export async function removeQueueItem(params: {
  queueItemId: string;
  workspaceUserId: string;
}): Promise<{ removed: boolean; reason: string }> {
  const rows = await db
    .select()
    .from(prospectOutreachQueueItems)
    .where(
      and(
        eq(prospectOutreachQueueItems.id, params.queueItemId),
        eq(prospectOutreachQueueItems.workspaceUserId, params.workspaceUserId),
      ),
    )
    .limit(1);
  const item = rows[0];
  if (!item) return { removed: false, reason: "not_found" };
  if (item.queueStatus === "sent" || item.queueStatus === "sending") {
    return { removed: false, reason: "already_sent_or_sending" };
  }
  await db
    .update(prospectOutreachQueueItems)
    .set({ queueStatus: "cancelled", updatedAt: new Date() })
    .where(eq(prospectOutreachQueueItems.id, item.id));
  return { removed: true, reason: "cancelled" };
}

export async function retryFailedQueueItem(params: {
  queueItemId: string;
  workspaceUserId: string;
}): Promise<{ retried: boolean; reason: string }> {
  const rows = await db
    .select()
    .from(prospectOutreachQueueItems)
    .where(
      and(
        eq(prospectOutreachQueueItems.id, params.queueItemId),
        eq(prospectOutreachQueueItems.workspaceUserId, params.workspaceUserId),
      ),
    )
    .limit(1);
  const item = rows[0];
  if (!item) return { retried: false, reason: "not_found" };
  if (item.queueStatus !== "failed") return { retried: false, reason: "not_failed" };
  if (item.attempts >= item.maxAttempts) return { retried: false, reason: "max_attempts" };
  const lastErr = String(item.lastError || "");
  if (/^permanent:/i.test(lastErr) || /suppressed|opted_out|bounce/i.test(lastErr)) {
    return { retried: false, reason: "permanent_failure" };
  }

  // Re-check contact suppression before allowing retry.
  const contact = await storage.getContact(item.contactId);
  if (contact) {
    const { contactSuppressionState } = await import("./prospectOutreachEligibilityService");
    const suppression = contactSuppressionState(contact);
    if (suppression.suppressed || suppression.optedOut) {
      return { retried: false, reason: "contact_suppressed" };
    }
  }

  await db
    .update(prospectOutreachQueueItems)
    .set({
      queueStatus: "queued",
      scheduledAt: new Date(Date.now() + 10_000),
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(prospectOutreachQueueItems.id, item.id));
  return { retried: true, reason: "requeued" };
}

/**
 * Claim one due queued item atomically (status queued → sending).
 * Protects against worker restart / double delivery.
 */
export async function claimNextDueQueueItem(
  workspaceUserId: string,
): Promise<ProspectOutreachQueueItemRow | null> {
  const settings = await getOutreachSettings(workspaceUserId);
  // Fail-closed: queueing alone must never send; Start arms queueRunning.
  if (!isProspectOutreachQueueArmed(settings)) return null;

  const now = new Date();
  const due = await db
    .select()
    .from(prospectOutreachQueueItems)
    .where(
      and(
        eq(prospectOutreachQueueItems.workspaceUserId, workspaceUserId),
        eq(prospectOutreachQueueItems.queueStatus, "queued"),
        or(
          lte(prospectOutreachQueueItems.scheduledAt, now),
          sql`${prospectOutreachQueueItems.scheduledAt} IS NULL`,
        ),
      ),
    )
    .orderBy(prospectOutreachQueueItems.scheduledAt)
    .limit(1);

  const item = due[0];
  if (!item) return null;

  // Daily / hourly bulk limits
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const hourStart = new Date();
  hourStart.setMinutes(0, 0, 0);

  const sentRows = await db
    .select({ sentAt: prospectOutreachQueueItems.sentAt })
    .from(prospectOutreachQueueItems)
    .where(
      and(
        eq(prospectOutreachQueueItems.workspaceUserId, workspaceUserId),
        eq(prospectOutreachQueueItems.queueStatus, "sent"),
      ),
    );
  const sentToday = sentRows.filter((r) => r.sentAt && r.sentAt >= dayStart).length;
  const sentHour = sentRows.filter((r) => r.sentAt && r.sentAt >= hourStart).length;
  if (sentToday >= settings.dailySendLimit || sentHour >= settings.hourlySendLimit) {
    return null;
  }

  const claimed = await db
    .update(prospectOutreachQueueItems)
    .set({
      queueStatus: "sending",
      startedAt: item.startedAt || now,
      // Attempts increment only when an actual send is attempted (see processClaimedQueueItem).
      updatedAt: now,
    })
    .where(
      and(
        eq(prospectOutreachQueueItems.id, item.id),
        eq(prospectOutreachQueueItems.queueStatus, "queued"),
      ),
    )
    .returning();

  return claimed[0] || null;
}

export async function processClaimedQueueItem(
  item: ProspectOutreachQueueItemRow,
): Promise<{ ok: boolean; reason: string }> {
  const started = Date.now();
  console.info(
    JSON.stringify(
      prospectBulkOutreachLog("send_started", {
        workspaceId: item.workspaceUserId,
        batchId: item.batchId,
        queueItemId: item.id,
        prospectIntelligenceId: item.contactId,
        contactId: item.contactId,
        selectedChannel: item.selectedChannel,
        attempts: item.attempts,
        status: "sending",
      }),
    ),
  );

  // Pre-send re-checks
  const contact = await storage.getContact(item.contactId);
  if (!contact) {
    await markItemFailed(item, "contact_not_found", false);
    return { ok: false, reason: "contact_not_found" };
  }

  const { loadPriorProspectOutreachEvidence } = await import(
    "./prospectOutreachEligibilityService"
  );
  const prior = await loadPriorProspectOutreachEvidence(item.contactId);
  // Allow this claim's own conversation if we already linked during an earlier partial send (none yet).
  if (prior.alreadyContacted) {
    // If evidence is only this in-flight send path's future link, continue;
    // otherwise skip duplicates (manual or prior queue).
    const selfConversation =
      item.conversationId && prior.conversationId && item.conversationId === prior.conversationId;
    if (!selfConversation) {
      await db
        .update(prospectOutreachQueueItems)
        .set({
          queueStatus: "skipped",
          lastError: prior.reason,
          updatedAt: new Date(),
        })
        .where(eq(prospectOutreachQueueItems.id, item.id));
      console.info(
        JSON.stringify(
          prospectBulkOutreachLog("prospect_skipped", {
            workspaceId: item.workspaceUserId,
            queueItemId: item.id,
            contactId: item.contactId,
            reason: prior.reason,
          }),
        ),
      );
      return { ok: false, reason: prior.reason };
    }
  }

  const piRows = await db
    .select()
    .from(prospectIntelligence)
    .where(eq(prospectIntelligence.contactId, item.contactId))
    .limit(1);
  const pi = piRows[0];
  if (pi?.outreachStatus === "replied" || pi?.outreachStatus === "outreach_sent") {
    await db
      .update(prospectOutreachQueueItems)
      .set({
        queueStatus: "skipped",
        lastError: `already_${pi.outreachStatus}`,
        updatedAt: new Date(),
      })
      .where(eq(prospectOutreachQueueItems.id, item.id));
    console.info(
      JSON.stringify(
        prospectBulkOutreachLog("prospect_skipped", {
          workspaceId: item.workspaceUserId,
          queueItemId: item.id,
          contactId: item.contactId,
          reason: `already_${pi.outreachStatus}`,
        }),
      ),
    );
    return { ok: false, reason: "already_contacted" };
  }

  if (!String(item.messageSnapshot || "").trim()) {
    await markItemFailed(item, "missing_message_snapshot", false);
    return { ok: false, reason: "missing_message_snapshot" };
  }

  const channel = item.selectedChannel as ProspectOutreachChannel;
  const sender = getProspectOutreachSender(channel);
  if (!sender) {
    await markItemFailed(item, "not_enabled_for_bulk", false);
    return { ok: false, reason: "not_enabled_for_bulk" };
  }

  const { result: eligibility } = await resolveProspectOutreachEligibilityForContact({
    contact,
    workspaceUserId: item.workspaceUserId,
    preferredChannel: channel as ProspectOutreachPreferredChannel,
    excludeQueueItemId: item.id,
    ignoreAlreadyQueued: true,
  });
  if (!eligibility.channels[channel]?.eligible) {
    const reason = eligibility.channels[channel]?.reason || eligibility.summaryReason || "eligibility_rejected";
    // Already contacted handled above; skip soft lifecycle duplicates
    if (reason === "already_outreach_sent" || reason === "already_replied") {
      await db
        .update(prospectOutreachQueueItems)
        .set({ queueStatus: "skipped", lastError: reason, updatedAt: new Date() })
        .where(eq(prospectOutreachQueueItems.id, item.id));
      return { ok: false, reason };
    }
    if (isSenderNotConnectedReason(reason) || reason === "suppressed" || reason === "opted_out") {
      if (isSenderNotConnectedReason(reason)) {
        const failureClass = failureClassFromEligibilityDetail(
          eligibility.channels[channel]?.detail,
        );
        const persistReason = formatSenderNotConnectedDiagnostic(failureClass);
        console.info(
          JSON.stringify(
            prospectBulkOutreachLog("sender_probe_failed", {
              ...prospectSenderProbeDiagLog({
                stage: "eligibility",
                failureClass,
                workspaceIdPrefix: item.workspaceUserId.slice(0, 8),
                queueItemIdPrefix: item.id.slice(0, 8),
                contactIdPrefix: item.contactId.slice(0, 8),
                mailboxIdPrefix: item.senderMailboxId?.slice(0, 8) ?? null,
              }),
              attempts: item.attempts,
              persistReason,
            }),
          ),
        );
        await pauseQueue(item.workspaceUserId);
        await releaseClaimedItemAfterInfraPause(item, persistReason);
        return { ok: false, reason: persistReason };
      }
      await markItemFailed(item, reason, false);
      return { ok: false, reason };
    }
  }

  const prepared = await sender.prepare({
    workspaceUserId: item.workspaceUserId,
    contactId: item.contactId,
    recipientIdentity: item.recipientIdentity,
    subjectSnapshot: item.subjectSnapshot,
    messageSnapshot: item.messageSnapshot,
    senderMailboxId: item.senderMailboxId,
    contactName: contact.name,
  }).catch(async (err) => {
    const msg = err instanceof Error ? err.message : String(err);
    const senderDiag = parseSenderNotConnectedDiagnostic(msg);
    const shouldPause =
      isSenderNotConnectedReason(msg) ||
      /reconnect|not connected|No connected email mailbox/i.test(msg);
    if (shouldPause) {
      const persistReason = isSenderNotConnectedReason(msg)
        ? formatSenderNotConnectedDiagnostic(
            senderDiag.failureClass || "other_probe_failure",
          )
        : /No connected email mailbox/i.test(msg)
          ? formatSenderNotConnectedDiagnostic("no_mailbox")
          : msg;
      console.info(
        JSON.stringify(
          prospectBulkOutreachLog("sender_probe_failed", {
            ...prospectSenderProbeDiagLog({
              stage: "prepare",
              failureClass: parseSenderNotConnectedDiagnostic(persistReason).failureClass ||
                "other_probe_failure",
              workspaceIdPrefix: item.workspaceUserId.slice(0, 8),
              queueItemIdPrefix: item.id.slice(0, 8),
              contactIdPrefix: item.contactId.slice(0, 8),
              mailboxIdPrefix: item.senderMailboxId?.slice(0, 8) ?? null,
              errMsgSafe: String(msg).slice(0, 160),
            }),
            attempts: item.attempts,
            persistReason,
          }),
        ),
      );
      await pauseQueue(item.workspaceUserId);
      await releaseClaimedItemAfterInfraPause(item, persistReason);
      return null;
    }
    await markItemFailed(item, msg, false);
    return null;
  });
  if (!prepared) return { ok: false, reason: "prepare_failed" };

  // Count a real send attempt only once we're past gates/prepare and calling the sender.
  const attemptNumber = (item.attempts || 0) + 1;
  await db
    .update(prospectOutreachQueueItems)
    .set({ attempts: attemptNumber, updatedAt: new Date() })
    .where(eq(prospectOutreachQueueItems.id, item.id));
  const itemWithAttempt = { ...item, attempts: attemptNumber };

  const sendResult = await sender.send({
    workspaceUserId: item.workspaceUserId,
    contactId: item.contactId,
    recipientIdentity: item.recipientIdentity,
    subjectSnapshot: prepared.subject,
    messageSnapshot: item.messageSnapshot,
    senderMailboxId: prepared.mailboxId,
    mailboxId: prepared.mailboxId,
    subject: prepared.subject,
    contactName: contact.name,
  });

  if (!sendResult.success) {
    if (sendResult.pauseQueue) {
      let persistError = sendResult.error || "paused";
      if (isSenderNotConnectedReason(persistError)) {
        const parsed = parseSenderNotConnectedDiagnostic(persistError);
        persistError = formatSenderNotConnectedDiagnostic(
          parsed.failureClass || "other_probe_failure",
        );
        console.info(
          JSON.stringify(
            prospectBulkOutreachLog("sender_probe_failed", {
              ...prospectSenderProbeDiagLog({
                stage: "send",
                failureClass: parsed.failureClass || "other_probe_failure",
                workspaceIdPrefix: item.workspaceUserId.slice(0, 8),
                queueItemIdPrefix: item.id.slice(0, 8),
                contactIdPrefix: item.contactId.slice(0, 8),
                mailboxIdPrefix: prepared.mailboxId.slice(0, 8),
                errMsgSafe: String(sendResult.error || "").slice(0, 160),
              }),
              attempts: itemWithAttempt.attempts,
              persistReason: persistError,
            }),
          ),
        );
      } else {
        console.info(
          JSON.stringify(
            prospectBulkOutreachLog("infra_pause_after_send_gate", {
              stage: "send",
              queueItemIdPrefix: item.id.slice(0, 8),
              error: String(sendResult.error || "").slice(0, 160),
              attempts: itemWithAttempt.attempts,
            }),
          ),
        );
      }
      await pauseQueue(item.workspaceUserId);
      await releaseClaimedItemAfterInfraPause(itemWithAttempt, persistError);
    } else {
      const { isPermanentEmailSendFailure } = await import("@shared/prospectEmailSuppression");
      const permanent = isPermanentEmailSendFailure(sendResult.error);
      if (permanent) {
        try {
          const { applyProspectEmailSuppression } = await import("./prospectEmailSuppressionService");
          await applyProspectEmailSuppression({
            contactId: item.contactId,
            reason: "invalid_recipient",
            detail: (sendResult.error || "permanent_send_failure").substring(0, 300),
            bouncedEmail: item.recipientIdentity,
            source: "prospect_queue_permanent_send_failure",
          });
        } catch (err) {
          console.error("[ProspectOutreach] permanent-failure suppression failed", err);
        }
        // Terminal — never silent requeue for permanent recipient failures.
        await markItemFailed(itemWithAttempt, `permanent:${sendResult.error || "send_failed"}`, false);
        await db
          .update(prospectOutreachQueueItems)
          .set({ attempts: itemWithAttempt.maxAttempts, updatedAt: new Date() })
          .where(eq(prospectOutreachQueueItems.id, item.id));
      } else {
        await markItemFailed(itemWithAttempt, sendResult.error || "send_failed", false);
      }
    }
    console.info(
      JSON.stringify(
        prospectBulkOutreachLog("send_failed", {
          workspaceId: item.workspaceUserId,
          batchId: item.batchId,
          queueItemId: item.id,
          contactId: item.contactId,
          selectedChannel: channel,
          attempts: attemptNumber,
          status: sendResult.pauseQueue ? "paused" : "failed",
          reason: sendResult.error,
          duration: Date.now() - started,
        }),
      ),
    );
    return { ok: false, reason: sendResult.error || "send_failed" };
  }

  // Idempotent success mark — even if process restarts after send,
  // claim requires queue_status=queued so this item won't send twice.
  await db
    .update(prospectOutreachQueueItems)
    .set({
      queueStatus: "sent",
      sentAt: new Date(),
      conversationId: sendResult.conversationId || null,
      messageId: sendResult.messageId || null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(prospectOutreachQueueItems.id, item.id));

  await db
    .update(prospectOutreachBatches)
    .set({
      sentCount: sql`${prospectOutreachBatches.sentCount} + 1`,
      status: "running",
    })
    .where(eq(prospectOutreachBatches.id, item.batchId));

  console.info(
    JSON.stringify(
      prospectBulkOutreachLog("send_succeeded", {
        workspaceId: item.workspaceUserId,
        batchId: item.batchId,
        queueItemId: item.id,
        prospectIntelligenceId: item.contactId,
        contactId: item.contactId,
        selectedChannel: channel,
        attempts: attemptNumber,
        status: "sent",
        duration: Date.now() - started,
      }),
    ),
  );

  return { ok: true, reason: "sent" };
}

async function markItemFailed(
  item: ProspectOutreachQueueItemRow,
  error: string,
  pause: boolean,
): Promise<void> {
  if (pause) {
    await pauseQueue(item.workspaceUserId);
    await releaseClaimedItemAfterInfraPause(item, error);
    return;
  }

  const terminal = item.attempts >= item.maxAttempts;
  await db
    .update(prospectOutreachQueueItems)
    .set({
      queueStatus: terminal ? "failed" : "failed",
      lastError: error.substring(0, 500),
      updatedAt: new Date(),
    })
    .where(eq(prospectOutreachQueueItems.id, item.id));

  await db
    .update(prospectOutreachBatches)
    .set({ failedCount: sql`${prospectOutreachBatches.failedCount} + 1` })
    .where(eq(prospectOutreachBatches.id, item.batchId));
}

/**
 * Recover items stuck in `sending` after worker crash.
 * Mark failed (retryable via Retry) rather than re-sending blindly.
 */
export async function recoverStuckSendingItems(maxAgeMs = 10 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMs);
  const stuck = await db
    .update(prospectOutreachQueueItems)
    .set({
      queueStatus: "failed",
      lastError: "recovered_stuck_sending_after_restart",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(prospectOutreachQueueItems.queueStatus, "sending"),
        lte(prospectOutreachQueueItems.updatedAt, cutoff),
      ),
    )
    .returning({ id: prospectOutreachQueueItems.id });
  return stuck.length;
}

export async function listWorkspaceIdsWithDueQueue(): Promise<string[]> {
  const now = new Date();
  const rows = await db
    .selectDistinct({ workspaceUserId: prospectOutreachQueueItems.workspaceUserId })
    .from(prospectOutreachQueueItems)
    .where(
      and(
        eq(prospectOutreachQueueItems.queueStatus, "queued"),
        or(
          lte(prospectOutreachQueueItems.scheduledAt, now),
          sql`${prospectOutreachQueueItems.scheduledAt} IS NULL`,
        ),
      ),
    );
  return rows.map((r) => r.workspaceUserId);
}

export async function bulkApproveProspects(params: {
  contactIds: string[];
  userId: string;
  workspaceUserId?: string;
}): Promise<{
  approved: number;
  approvedContactIds: string[];
  skipped: Array<{ contactId: string; reason: string }>;
}> {
  const { approveProspectIntelligence } = await import("./prospectIntelligenceService");
  const skipped: Array<{ contactId: string; reason: string }> = [];
  const approvedContactIds: string[] = [];

  for (const contactId of Array.from(new Set(params.contactIds))) {
    if (params.workspaceUserId) {
      const contact = await storage.getContact(contactId);
      if (!contact || contact.userId !== params.workspaceUserId) {
        skipped.push({ contactId, reason: "wrong_workspace" });
        continue;
      }
    }
    const rows = await db
      .select()
      .from(prospectIntelligence)
      .where(eq(prospectIntelligence.contactId, contactId))
      .limit(1);
    const pi = rows[0];
    if (!pi) {
      skipped.push({ contactId, reason: "analysis_incomplete" });
      continue;
    }
    if (pi.analysisStatus !== "completed" && pi.analysisStatus !== "needs_review") {
      skipped.push({ contactId, reason: "analysis_incomplete" });
      continue;
    }
    // Needs Review is enrichable — Enrich IS the human approval (do not skip).
    if (pi.outreachStatus === "replied" || pi.outreachStatus === "outreach_sent") {
      skipped.push({ contactId, reason: `already_${pi.outreachStatus}` });
      continue;
    }
    try {
      await approveProspectIntelligence(contactId, params.userId, {
        workspaceUserId: params.workspaceUserId,
      });
      approvedContactIds.push(contactId);
    } catch (err) {
      skipped.push({
        contactId,
        reason: err instanceof Error ? err.message : "approve_failed",
      });
    }
  }
  return { approved: approvedContactIds.length, approvedContactIds, skipped };
}

export async function bulkMarkNeedsReview(
  contactIds: string[],
  workspaceUserId?: string,
): Promise<{ updated: number }> {
  const { markProspectNeedsReview } = await import("./prospectIntelligenceService");
  let updated = 0;
  for (const contactId of Array.from(new Set(contactIds))) {
    try {
      await markProspectNeedsReview(contactId, workspaceUserId);
      updated += 1;
    } catch {
      /* skip */
    }
  }
  return { updated };
}

export const prospectOutreachQueueService = {
  getOutreachSettings,
  updateOutreachSettings,
  previewQueueBatch,
  createQueueBatch,
  listQueueItems,
  getQueueDashboard,
  pauseQueue,
  resumeQueue,
  startQueue,
  removeQueueItem,
  retryFailedQueueItem,
  claimNextDueQueueItem,
  processClaimedQueueItem,
  recoverStuckSendingItems,
  listWorkspaceIdsWithDueQueue,
  rescheduleQueuedOutreachItems,
  bulkApproveProspects,
  bulkMarkNeedsReview,
};
