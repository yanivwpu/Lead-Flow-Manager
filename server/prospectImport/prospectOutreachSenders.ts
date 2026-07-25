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
import { buildProspectOutreachSubject } from "@shared/prospectContactEnrichment";
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

/**
 * Resolve the live sendable mailbox for campaign outbound.
 * Prefer the queue snapshot when it still probes successfully; otherwise fall
 * back to the current primary (Settings / Sync / Inbox source of truth).
 */
async function resolveLiveCampaignMailbox(params: {
  workspaceUserId: string;
  preferredMailboxId?: string | null;
}): Promise<{ ok: true; mailboxId: string } | { ok: false; reason: string }> {
  const { resolveEmailSenderForBulkOutreach } = await import(
    "./prospectOutreachEligibilityService"
  );
  const { getValidMailboxAccessToken } = await import("../emailChannel/oauth");
  const { isEmailMailboxSyncStatusSendable } = await import("@shared/emailMailboxAvailability");

  const preferredId = String(params.preferredMailboxId || "").trim();
  if (preferredId) {
    const mailbox = await getEmailMailboxById(preferredId);
    if (
      mailbox &&
      mailbox.workspaceUserId === params.workspaceUserId &&
      isEmailMailboxSyncStatusSendable(mailbox.syncStatus)
    ) {
      try {
        await getValidMailboxAccessToken(mailbox.id);
        return { ok: true, mailboxId: mailbox.id };
      } catch {
        /* fall through to live primary */
      }
    }
  }

  const avail = await resolveEmailSenderForBulkOutreach(params.workspaceUserId);
  if (avail.emailConnected && avail.emailMailboxId) {
    return { ok: true, mailboxId: avail.emailMailboxId };
  }
  return { ok: false, reason: "sender_not_connected" };
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
    });
    if (!live.ok) {
      throw new Error("No connected email mailbox");
    }
    const mailbox =
      (await getEmailMailboxById(live.mailboxId)) ||
      (await getPrimaryEmailMailbox(input.workspaceUserId));
    if (!mailbox) throw new Error("No connected email mailbox");
    const subject =
      String(input.subjectSnapshot || "").trim() ||
      buildProspectOutreachSubject(input.contactName || "there");
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
        const pauseQueue =
          /not connected|reconnect|mailbox|oauth|unauthorized|401|403/i.test(err) ||
          /hourly email send limit|daily email send limit/i.test(err);
        return { success: false, error: err, pauseQueue };
      }

      return {
        success: true,
        conversationId: result.conversationId,
        messageId: result.messageId,
        externalMessageId: result.externalMessageId,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const pauseQueue =
        /hourly email send limit|daily email send limit|not connected|reconnect/i.test(message);
      return { success: false, error: message, pauseQueue };
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
