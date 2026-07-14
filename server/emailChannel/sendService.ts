import {
  EMAIL_SEND_DAILY_SOFT_CAP,
  EMAIL_SEND_HOURLY_SOFT_CAP,
  type EmailRichSendPayload,
} from "@shared/emailChannel";
import { contactHasDoNotContact } from "../automationSendGuard";
import { storage } from "../storage";
import { notifyUser } from "../presence";
import { getValidMailboxAccessToken } from "./oauth";
import { getEmailProvider } from "./gmailProvider";
import {
  getEmailMailboxById,
  insertEmailMessageDetail,
  updateEmailMailbox,
  getEmailMessageDetail,
} from "./mailboxStore";
import { findEmailConversationByThread } from "./persistInbound";
import { sanitizeEmailHtml, htmlToPlainText } from "./htmlSanitize";
import { normalizeEmailAddress } from "@shared/emailChannel";

function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}
function hourKey(d = new Date()): string {
  return d.toISOString().slice(0, 13);
}

export async function assertEmailSendRateLimit(mailboxId: string): Promise<void> {
  const mailbox = await getEmailMailboxById(mailboxId);
  if (!mailbox) throw new Error("Mailbox not found");
  const dKey = dayKey();
  const hKey = hourKey();
  let dayCount = mailbox.sendCountDayKey === dKey ? mailbox.messagesSentToday || 0 : 0;
  let hourCount = mailbox.sendCountHourKey === hKey ? mailbox.messagesSentHour || 0 : 0;
  if (hourCount >= EMAIL_SEND_HOURLY_SOFT_CAP) {
    throw new Error(`Hourly email send limit reached (${EMAIL_SEND_HOURLY_SOFT_CAP})`);
  }
  if (dayCount >= EMAIL_SEND_DAILY_SOFT_CAP) {
    throw new Error(`Daily email send limit reached (${EMAIL_SEND_DAILY_SOFT_CAP})`);
  }
}

async function bumpEmailSendCounters(mailboxId: string): Promise<void> {
  const mailbox = await getEmailMailboxById(mailboxId);
  if (!mailbox) return;
  const dKey = dayKey();
  const hKey = hourKey();
  const dayCount = mailbox.sendCountDayKey === dKey ? mailbox.messagesSentToday || 0 : 0;
  const hourCount = mailbox.sendCountHourKey === hKey ? mailbox.messagesSentHour || 0 : 0;
  await updateEmailMailbox(mailboxId, {
    sendCountDayKey: dKey,
    sendCountHourKey: hKey,
    messagesSentToday: dayCount + 1,
    messagesSentHour: hourCount + 1,
  });
}

export type EmailOutboundResult = {
  success: boolean;
  messageId?: string;
  conversationId?: string;
  channel: "email";
  externalMessageId?: string;
  error?: string;
};

/**
 * Send or reply via connected Gmail mailbox. Creates conversation/message records.
 */
export async function sendEmailViaMailbox(params: {
  workspaceUserId: string;
  sentByUserId: string;
  contactId: string;
  mailboxId: string;
  content: string;
  rich: EmailRichSendPayload;
}): Promise<EmailOutboundResult> {
  const contact = await storage.getContact(params.contactId);
  if (!contact || contact.userId !== params.workspaceUserId) {
    return { success: false, channel: "email", error: "Contact not found" };
  }

  const dnc = contactHasDoNotContact(contact);
  if (dnc.blocked) {
    return { success: false, channel: "email", error: "Contact is marked do-not-contact" };
  }
  const cf = (contact.customFields || {}) as Record<string, unknown>;
  if (cf.emailBounced === true || cf.bounced === true || cf.suppressed === true) {
    return {
      success: false,
      channel: "email",
      error: `Contact email is suppressed (${String(cf.suppressionReason || "bounced_or_suppressed")})`,
    };
  }

  const mailbox = await getEmailMailboxById(params.mailboxId);
  if (!mailbox || mailbox.workspaceUserId !== params.workspaceUserId) {
    return { success: false, channel: "email", error: "Mailbox not found or not owned by workspace" };
  }

  try {
    await assertEmailSendRateLimit(mailbox.id);
  } catch (err) {
    return {
      success: false,
      channel: "email",
      error: err instanceof Error ? err.message : "Rate limit",
    };
  }

  const to =
    params.rich.to?.filter(Boolean) ||
    (contact.email ? [normalizeEmailAddress(contact.email)!].filter(Boolean) : []);
  if (!to.length) {
    return { success: false, channel: "email", error: "Contact has no email address" };
  }

  const textBody = params.rich.textBody?.trim() || params.content.trim();
  const htmlBody = params.rich.htmlBody?.trim() || null;
  if (!textBody && !htmlBody) {
    return { success: false, channel: "email", error: "Message body required" };
  }

  const replyMode = params.rich.replyMode || (params.rich.providerThreadId ? "reply" : "new");
  let subject = String(params.rich.subject || "").trim();
  let threadId = params.rich.providerThreadId || null;
  let conversation =
    threadId
      ? await findEmailConversationByThread({
          workspaceUserId: params.workspaceUserId,
          mailboxId: mailbox.id,
          threadId,
        })
      : null;

  // Resolve existing email conversation for this contact+mailbox when replying
  if (!conversation && replyMode !== "new") {
    const withConvs = await storage.getContactWithConversations(params.contactId);
    conversation =
      withConvs?.conversations.find(
        (c) => c.channel === "email" && c.channelAccountId === mailbox.id,
      ) || null;
    if (conversation?.externalThreadId) {
      threadId = conversation.externalThreadId;
    }
  }

  if (conversation) {
    threadId = conversation.externalThreadId;
    subject = subject || conversation.subject || "Re:";
  }

  if (replyMode === "new" && !subject) {
    return { success: false, channel: "email", error: "Subject required for new email" };
  }
  if (!subject) subject = "Re:";

  // Load In-Reply-To from last inbound if needed
  let inReplyTo = params.rich.inReplyTo || null;
  let references = params.rich.references || [];
  if (conversation && !inReplyTo) {
    const msgs = await storage.getMessages(conversation.id, 20);
    const last = [...msgs].reverse().find((m) => m.direction === "inbound") || msgs[msgs.length - 1];
    if (last) {
      const detail = await getEmailMessageDetail(last.id);
      if (detail?.rfcMessageId) {
        inReplyTo = detail.rfcMessageId;
        const prevRefs = Array.isArray(detail.referencesHeader)
          ? (detail.referencesHeader as string[])
          : [];
        references = [...prevRefs, detail.rfcMessageId].filter(Boolean);
      }
    }
  }

  if (!conversation) {
    conversation = await storage.createConversation({
      userId: params.workspaceUserId,
      contactId: contact.id,
      channel: "email",
      channelAccountId: mailbox.id,
      externalThreadId: threadId || `pending-${Date.now()}`,
      status: "open",
      subject,
      lastMessageAt: new Date(),
      lastMessagePreview: textBody.slice(0, 100),
      lastMessageDirection: "outbound",
      unreadCount: 0,
    } as any);
  }

  const pending = await storage.createMessage({
    conversationId: conversation.id,
    contactId: contact.id,
    userId: params.workspaceUserId,
    direction: "outbound",
    content: textBody || htmlToPlainText(htmlBody || ""),
    contentType: htmlBody ? "email_html" : "text",
    status: "pending",
    sentByUserId: params.sentByUserId,
  } as any);

  const sanitized = sanitizeEmailHtml(htmlBody);
  await insertEmailMessageDetail({
    messageId: pending.id,
    subject,
    htmlBody: sanitized.html || null,
    textBody: textBody || null,
    fromAddress: mailbox.emailAddress,
    toAddresses: to.map((e) => ({ email: e })),
    ccAddresses: (params.rich.cc || []).map((e) => ({ email: e })),
    bccAddresses: (params.rich.bcc || []).map((e) => ({ email: e })),
    replyToAddress: null,
    rfcMessageId: null,
    inReplyTo,
    referencesHeader: references,
    providerThreadId: threadId,
    snippet: textBody.slice(0, 200),
    hasAttachments: false,
    attachmentMetadata: [],
    selectedHeaders: {},
  });

  try {
    const { accessToken } = await getValidMailboxAccessToken(mailbox.id);
    const provider = getEmailProvider(mailbox.provider);
    const payload: EmailRichSendPayload = {
      ...params.rich,
      mailboxId: mailbox.id,
      to,
      subject,
      inReplyTo: inReplyTo || undefined,
      references,
      providerThreadId: threadId || undefined,
    };

    const result =
      threadId && replyMode !== "new"
        ? await provider.replyToThread({
            accessToken,
            from: mailbox.emailAddress,
            threadId,
            payload,
            textBody: textBody || htmlToPlainText(htmlBody || ""),
            htmlBody: sanitized.html || null,
          })
        : await provider.sendNewEmail({
            accessToken,
            from: mailbox.emailAddress,
            payload,
            textBody: textBody || htmlToPlainText(htmlBody || ""),
            htmlBody: sanitized.html || null,
          });

    if (!result.success) {
      await storage.updateMessage(pending.id, {
        status: "failed",
        errorMessage: result.error || "Send failed",
      });

      try {
        const { isPermanentEmailSendFailure } = await import("@shared/prospectEmailSuppression");
        if (isPermanentEmailSendFailure(result.error)) {
          const { applyProspectEmailSuppression } = await import(
            "../prospectImport/prospectEmailSuppressionService"
          );
          await applyProspectEmailSuppression({
            contactId: contact.id,
            reason: "invalid_recipient",
            detail: (result.error || "permanent_send_failure").substring(0, 300),
            bouncedEmail: to[0] || null,
            source: "email_send_permanent_failure",
          });
        }
      } catch (err) {
        console.error("[EmailSend] permanent-failure suppression failed", err);
      }

      return {
        success: false,
        channel: "email",
        messageId: pending.id,
        conversationId: conversation.id,
        error: result.error || "Send failed",
      };
    }

    await storage.updateMessage(pending.id, {
      status: "sent",
      externalMessageId: result.providerMessageId,
      sentAt: new Date(),
    });

    if (result.providerThreadId && result.providerThreadId !== conversation.externalThreadId) {
      await storage.updateConversation(conversation.id, {
        externalThreadId: result.providerThreadId,
        subject,
        lastMessageAt: new Date(),
        lastMessagePreview: textBody.slice(0, 100),
        lastMessageDirection: "outbound",
      } as any);
    } else {
      await storage.updateConversation(conversation.id, {
        subject,
        lastMessageAt: new Date(),
        lastMessagePreview: textBody.slice(0, 100),
        lastMessageDirection: "outbound",
      } as any);
    }

    await bumpEmailSendCounters(mailbox.id);

    await storage.createActivityEvent({
      userId: params.workspaceUserId,
      contactId: contact.id,
      conversationId: conversation.id,
      eventType: "message",
      eventData: {
        direction: "outbound",
        channel: "email",
        preview: textBody.slice(0, 100),
        sentByUserId: params.sentByUserId,
      },
      actorType: "user",
      actorId: params.sentByUserId,
    });

    notifyUser(params.workspaceUserId, {
      type: "new_message",
      conversationId: conversation.id,
      contactId: contact.id,
    });

    return {
      success: true,
      channel: "email",
      messageId: pending.id,
      conversationId: conversation.id,
      externalMessageId: result.providerMessageId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";
    await storage.updateMessage(pending.id, {
      status: "failed",
      errorMessage: message,
    });
    return {
      success: false,
      channel: "email",
      messageId: pending.id,
      conversationId: conversation.id,
      error: message,
    };
  }
}
