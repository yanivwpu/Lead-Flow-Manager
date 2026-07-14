/**
 * Channel-agnostic ProspectOutreachSender interface.
 * Email is the only production bulk sender in Phase 2.
 * Do not fake WhatsApp/SMS/Messenger senders.
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
  }): Promise<{ ok: boolean; reason?: string; pauseQueue?: boolean }>;
  prepare(input: ProspectOutreachSendPrepareInput): Promise<{
    subject: string;
    body: string;
    mailboxId: string;
  }>;
  send(input: ProspectOutreachSendPrepareInput & { mailboxId: string; subject: string }): Promise<ProspectOutreachSendResult>;
}

export const emailProspectOutreachSender: ProspectOutreachSender = {
  channel: "email",

  async canSend(input) {
    const { resolveEmailSenderForBulkOutreach } = await import(
      "./prospectOutreachEligibilityService"
    );
    // When a specific mailbox is specified, probe that id; else primary for workspace.
    if (input.senderMailboxId) {
      const mailbox = await getEmailMailboxById(input.senderMailboxId);
      if (!mailbox) {
        return { ok: false, reason: "sender_not_connected", pauseQueue: true };
      }
      const { isEmailMailboxSyncStatusSendable } = await import("@shared/emailMailboxAvailability");
      if (!isEmailMailboxSyncStatusSendable(mailbox.syncStatus)) {
        return { ok: false, reason: "sender_not_connected", pauseQueue: true };
      }
      try {
        const { getValidMailboxAccessToken } = await import("../emailChannel/oauth");
        await getValidMailboxAccessToken(mailbox.id);
      } catch {
        return { ok: false, reason: "sender_not_connected", pauseQueue: true };
      }
    } else {
      const avail = await resolveEmailSenderForBulkOutreach(input.workspaceUserId);
      if (!avail.emailConnected) {
        return { ok: false, reason: "sender_not_connected", pauseQueue: true };
      }
    }
    if (!String(input.recipientIdentity || "").includes("@")) {
      return { ok: false, reason: "missing_identity" };
    }
    return { ok: true };
  },

  async prepare(input) {
    const mailbox = input.senderMailboxId
      ? await getEmailMailboxById(input.senderMailboxId)
      : await getPrimaryEmailMailbox(input.workspaceUserId);
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
          mailboxId: input.mailboxId,
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
