/**
 * Channel-agnostic ProspectOutreachSender interface.
 * Email is the only production bulk sender in Phase 2.
 * Do not fake WhatsApp/SMS/Messenger senders.
 *
 * Outbound mailbox source of truth: email_mailboxes via
 * resolveEmailSenderForBulkOutreach / getPrimaryEmailMailbox
 * (same store as Settings Sync + Inbox).
 */

import type { ProspectOutreachChannel } from "@shared/prospectBulkOutreach";
import { resolveProspectOutreachSubject } from "@shared/prospectOutreachInstructions";
import {
  classifyEmailSenderProbeError,
  classifyMailboxSyncStatusNotSendable,
  formatSenderNotConnectedDiagnostic,
  prospectSenderProbeDiagLog,
  safeProbeErrorMessage,
  type ProspectSenderProbeFailureClass,
} from "@shared/prospectSenderProbeDiagnostics";
import { channelService } from "../channelService";
import { getEmailMailboxById, getPrimaryEmailMailbox } from "../emailChannel/mailboxStore";

export type ProspectOutreachSendPrepareInput = {
  workspaceUserId: string;
  contactId: string;
  recipientIdentity: string;
  subjectSnapshot?: string | null;
  messageSnapshot: string;
  senderMailboxId?: string | null;
  contactName?: string | null;
};

export type ProspectOutreachSendResult = {
  success: boolean;
  conversationId?: string;
  messageId?: string;
  externalMessageId?: string;
  error?: string;
  /** Soft pause recommendation (mailbox disconnected / rate limit). */
  pauseQueue?: boolean;
};

export interface ProspectOutreachSender {
  channel: ProspectOutreachChannel;
  canSend(input: {
    workspaceUserId: string;
    senderMailboxId?: string | null;
    recipientIdentity: string;
  }): Promise<{ ok: boolean; reason?: string; pauseQueue?: boolean; mailboxId?: string | null }>;
  prepare(input: ProspectOutreachSendPrepareInput): Promise<{
    subject: string;
    body: string;
    mailboxId: string;
  }>;
  send(input: ProspectOutreachSendPrepareInput & { mailboxId: string; subject: string }): Promise<ProspectOutreachSendResult>;
}

function logSenderProbeFailure(input: {
  stage: "preferred_probe" | "primary_probe" | "prepare" | "send";
  failureClass: ProspectSenderProbeFailureClass;
  workspaceUserId: string;
  mailboxId?: string | null;
  preferredMailboxId?: string | null;
  syncStatus?: string | null;
  err?: unknown;
}): void {
  console.info(
    JSON.stringify(
      prospectSenderProbeDiagLog({
        stage: input.stage,
        failureClass: input.failureClass,
        workspaceIdPrefix: input.workspaceUserId.slice(0, 8),
        mailboxIdPrefix: input.mailboxId ? input.mailboxId.slice(0, 8) : null,
        preferredMailboxIdPrefix: input.preferredMailboxId
          ? input.preferredMailboxId.slice(0, 8)
          : null,
        syncStatus: input.syncStatus || null,
        errName: input.err instanceof Error ? input.err.name : input.err ? "unknown" : null,
        errMsgSafe: input.err ? safeProbeErrorMessage(input.err) : null,
      }),
    ),
  );
}

/**
 * Resolve the live sendable mailbox for campaign outbound.
 * Prefer the queue snapshot when it still probes successfully; otherwise fall
 * back to the current primary (Settings / Sync / Inbox source of truth).
 */
async function resolveLiveCampaignMailbox(params: {
  workspaceUserId: string;
  preferredMailboxId?: string | null;
  stage?: "prepare" | "send";
}): Promise<{ ok: true; mailboxId: string } | { ok: false; reason: string }> {
  const { resolveEmailSenderForBulkOutreach } = await import(
    "./prospectOutreachEligibilityService"
  );
  const { getValidMailboxAccessToken } = await import("../emailChannel/oauth");
  const { isEmailMailboxSyncStatusSendable } = await import("@shared/emailMailboxAvailability");

  const preferredId = String(params.preferredMailboxId || "").trim();
  if (preferredId) {
    const mailbox = await getEmailMailboxById(preferredId);
    if (mailbox && mailbox.workspaceUserId === params.workspaceUserId) {
      if (!isEmailMailboxSyncStatusSendable(mailbox.syncStatus)) {
        logSenderProbeFailure({
          stage: "preferred_probe",
          failureClass: classifyMailboxSyncStatusNotSendable(mailbox.syncStatus),
          workspaceUserId: params.workspaceUserId,
          mailboxId: mailbox.id,
          preferredMailboxId: preferredId,
          syncStatus: mailbox.syncStatus,
        });
      } else {
        try {
          await getValidMailboxAccessToken(mailbox.id);
          return { ok: true, mailboxId: mailbox.id };
        } catch (err) {
          logSenderProbeFailure({
            stage: "preferred_probe",
            failureClass: classifyEmailSenderProbeError(err),
            workspaceUserId: params.workspaceUserId,
            mailboxId: mailbox.id,
            preferredMailboxId: preferredId,
            syncStatus: mailbox.syncStatus,
            err,
          });
          /* fall through to live primary */
        }
      }
    }
  }

  const avail = await resolveEmailSenderForBulkOutreach(params.workspaceUserId);
  if (avail.emailConnected && avail.emailMailboxId) {
    return { ok: true, mailboxId: avail.emailMailboxId };
  }

  const failureClass: ProspectSenderProbeFailureClass =
    avail.failureClass || "other_probe_failure";
  // primary_probe already logs inside resolveEmailSenderForBulkOutreach; add prepare/send stage context.
  if (params.stage === "prepare" || params.stage === "send") {
    logSenderProbeFailure({
      stage: params.stage,
      failureClass,
      workspaceUserId: params.workspaceUserId,
      preferredMailboxId: preferredId || null,
    });
  }

  return {
    ok: false,
    reason: formatSenderNotConnectedDiagnostic(
      failureClass,
      failureClass === "decrypt" ? avail.decryptField || "access_token" : null,
    ),
  };
}

export const emailProspectOutreachSender: ProspectOutreachSender = {
  channel: "email",

  async canSend(input) {
    if (!String(input.recipientIdentity || "").includes("@")) {
      return { ok: false, reason: "missing_identity" };
    }
    const live = await resolveLiveCampaignMailbox({
      workspaceUserId: input.workspaceUserId,
      preferredMailboxId: input.senderMailboxId,
      stage: "send",
    });
    if (!live.ok) {
      return { ok: false, reason: live.reason, pauseQueue: true };
    }
    return { ok: true, mailboxId: live.mailboxId };
  },

  async prepare(input) {
    const live = await resolveLiveCampaignMailbox({
      workspaceUserId: input.workspaceUserId,
      preferredMailboxId: input.senderMailboxId,
      stage: "prepare",
    });
    if (!live.ok) {
      // Preserve classifier in thrown message for infra-pause lastError persistence.
      throw new Error(live.reason);
    }
    const mailbox =
      (await getEmailMailboxById(live.mailboxId)) ||
      (await getPrimaryEmailMailbox(input.workspaceUserId));
    if (!mailbox) {
      const reason = formatSenderNotConnectedDiagnostic("no_mailbox");
      logSenderProbeFailure({
        stage: "prepare",
        failureClass: "no_mailbox",
        workspaceUserId: input.workspaceUserId,
        preferredMailboxId: input.senderMailboxId,
      });
      throw new Error(reason);
    }
    const subject =
      String(input.subjectSnapshot || "").trim() ||
      resolveProspectOutreachSubject({
        prospectName: input.contactName || "there",
      });
    const body = String(input.messageSnapshot || "").trim();
    if (!body) throw new Error("Approved message snapshot is empty");
    return { subject, body, mailboxId: mailbox.id };
  },

  async send(input) {
    const gate = await this.canSend({
      workspaceUserId: input.workspaceUserId,
      senderMailboxId: input.mailboxId,
      recipientIdentity: input.recipientIdentity,
    });
    if (!gate.ok) {
      return { success: false, error: gate.reason || "cannot_send", pauseQueue: gate.pauseQueue };
    }

    try {
      const result = await channelService.sendMessage({
        userId: input.workspaceUserId,
        contactId: input.contactId,
        content: input.messageSnapshot,
        forceChannel: "email",
        suppressFallback: true,
        emailRich: {
          mailboxId: gate.mailboxId || input.mailboxId,
          subject: input.subject,
          textBody: input.messageSnapshot,
          replyMode: "new",
          prospectOutreach: true,
        },
      });

      if (!result.success) {
        const err = result.error || "email_send_failed";
        const { shouldGloballyPauseProspectCampaign } = await import(
          "@shared/prospectOutreachFailureScope"
        );
        return {
          success: false,
          error: err,
          pauseQueue: shouldGloballyPauseProspectCampaign(err),
        };
      }

      return {
        success: true,
        conversationId: result.conversationId,
        messageId: result.messageId,
        externalMessageId: result.externalMessageId,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const { shouldGloballyPauseProspectCampaign } = await import(
        "@shared/prospectOutreachFailureScope"
      );
      return {
        success: false,
        error: message,
        pauseQueue: shouldGloballyPauseProspectCampaign(message),
      };
    }
  },
};

export function getProspectOutreachSender(
  channel: ProspectOutreachChannel,
): ProspectOutreachSender | null {
  if (channel === "email") return emailProspectOutreachSender;
  // Intentionally no fake SMS/WhatsApp/Messenger senders.
  return null;
}
