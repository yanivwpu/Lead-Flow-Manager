import { and, eq } from "drizzle-orm";
import { conversations, type EmailMailbox } from "@shared/schema";
import type { NormalizedEmailMessage } from "@shared/emailChannel";
import { nextEmailConversationUnreadCount } from "@shared/emailUnreadState";
import { db } from "../../drizzle/db";
import { storage } from "../storage";
import { notifyUser } from "../presence";
import { resolveEmailContact } from "./contactMatch";
import { insertEmailMessageDetail } from "./mailboxStore";
import { sanitizeEmailHtml, htmlToPlainText } from "./htmlSanitize";

export async function findEmailConversationByThread(params: {
  workspaceUserId: string;
  mailboxId: string;
  threadId: string;
}) {
  const rows = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.userId, params.workspaceUserId),
        eq(conversations.channel, "email"),
        eq(conversations.channelAccountId, params.mailboxId),
        eq(conversations.externalThreadId, params.threadId),
      ),
    )
    .limit(1);
  return rows[0];
}

export async function persistNormalizedEmailMessage(params: {
  mailbox: EmailMailbox;
  normalized: NormalizedEmailMessage;
  /** Skip notify for bulk initial sync (optional). */
  silent?: boolean;
}): Promise<{ messageId: string; conversationId: string; contactId: string; created: boolean } | null> {
  const { mailbox, normalized } = params;

  const existing = await storage.getMessageByUserExternalId(
    mailbox.workspaceUserId,
    normalized.providerMessageId,
  );
  if (existing) {
    return {
      messageId: existing.id,
      conversationId: existing.conversationId,
      contactId: existing.contactId,
      created: false,
    };
  }

  const primaryTo = normalized.to[0]?.email || null;
  const match = await resolveEmailContact({
    workspaceUserId: mailbox.workspaceUserId,
    fromEmail: normalized.from.email,
    fromName: normalized.from.name,
    mailboxEmail: mailbox.emailAddress,
    direction: normalized.direction,
    toEmail: primaryTo,
  });

  if (match.kind === "suppressed") {
    console.log(
      JSON.stringify({
        tag: "[EmailPersist]",
        event: "suppressed",
        reason: match.reason,
        direction: normalized.direction,
      }),
    );
    return null;
  }

  const contact = match.contact;
  let conversation = await findEmailConversationByThread({
    workspaceUserId: mailbox.workspaceUserId,
    mailboxId: mailbox.id,
    threadId: normalized.providerThreadId,
  });

  if (!conversation) {
    conversation = await storage.createConversation({
      userId: mailbox.workspaceUserId,
      contactId: contact.id,
      channel: "email",
      channelAccountId: mailbox.id,
      externalThreadId: normalized.providerThreadId,
      status: "open",
      subject: normalized.subject,
      lastMessageAt: normalized.sentAt,
      lastMessagePreview: (normalized.snippet || normalized.textBody || "").slice(0, 100),
      lastMessageDirection: normalized.direction,
      unreadCount: normalized.direction === "inbound" ? 1 : 0,
    } as any);
  } else {
    const unread = nextEmailConversationUnreadCount({
      messageAlreadyExists: false,
      direction: normalized.direction,
      currentUnread: conversation.unreadCount || 0,
    });
    await storage.updateConversation(conversation.id, {
      lastMessageAt: normalized.sentAt,
      lastMessagePreview: (normalized.snippet || normalized.textBody || "").slice(0, 100),
      lastMessageDirection: normalized.direction,
      unreadCount: unread,
      subject: conversation.subject || normalized.subject,
    } as any);
  }

  const textContent =
    normalized.textBody?.trim() ||
    (normalized.htmlBody ? htmlToPlainText(normalized.htmlBody) : "") ||
    normalized.snippet ||
    "";

  const message = await storage.createMessage({
    conversationId: conversation.id,
    contactId: contact.id,
    userId: mailbox.workspaceUserId,
    direction: normalized.direction,
    content: textContent,
    contentType: normalized.htmlBody ? "email_html" : "text",
    status: normalized.direction === "outbound" ? "sent" : "delivered",
    externalMessageId: normalized.providerMessageId,
    sentAt: normalized.sentAt,
  } as any);

  const sanitized = sanitizeEmailHtml(normalized.htmlBody);
  await insertEmailMessageDetail({
    messageId: message.id,
    subject: normalized.subject,
    htmlBody: sanitized.html || null,
    textBody: normalized.textBody,
    fromAddress: normalized.from.email,
    toAddresses: normalized.to,
    ccAddresses: normalized.cc,
    bccAddresses: normalized.bcc,
    replyToAddress: normalized.replyTo?.email || null,
    rfcMessageId: normalized.rfcMessageId,
    inReplyTo: normalized.inReplyTo,
    referencesHeader: normalized.references,
    providerThreadId: normalized.providerThreadId,
    snippet: normalized.snippet,
    hasAttachments: normalized.hasAttachments,
    attachmentMetadata: normalized.attachments,
    selectedHeaders: normalized.selectedHeaders || {},
  });

  try {
    await storage.createActivityEvent({
      userId: mailbox.workspaceUserId,
      contactId: contact.id,
      conversationId: conversation.id,
      eventType: "message",
      eventData: {
        direction: normalized.direction,
        channel: "email",
        preview: textContent.slice(0, 100),
      },
      actorType: normalized.direction === "inbound" ? "contact" : "system",
    });
  } catch {
    /* non-fatal */
  }

  if (!params.silent) {
    notifyUser(mailbox.workspaceUserId, {
      type: "new_message",
      conversationId: conversation.id,
      contactId: contact.id,
    });
  }

  return {
    messageId: message.id,
    conversationId: conversation.id,
    contactId: contact.id,
    created: true,
  };
}
