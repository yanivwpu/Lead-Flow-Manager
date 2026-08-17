import { and, eq } from "drizzle-orm";
import { conversations, type EmailMailbox } from "@shared/schema";
import type { NormalizedEmailMessage } from "@shared/emailChannel";
import { isCalendarOrInviteEmail } from "@shared/emailChannel";
import { nextEmailConversationUnreadCount } from "@shared/emailUnreadState";
import { db } from "../../drizzle/db";
import { storage } from "../storage";
import { notifyUser } from "../presence";
import { resolveEmailContact, shouldSuppressEmailContactCreation } from "./contactMatch";
import { insertEmailMessageDetail } from "./mailboxStore";
import { sanitizeEmailHtml, htmlToPlainText } from "./htmlSanitize";
import { logEmailUnreadDiag } from "./emailUnreadDiag";
import {
  classifyNormalizedInboundEmail,
  conversationPreviewForInbound,
  logWebsiteFormClassification,
  messageContentForInbound,
} from "./websiteFormPersist";
import { looksLikeNotificationSender } from "@shared/emailReplyTarget";

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
    logEmailUnreadDiag("persist_skip_existing_message", {
      conversationId: existing.conversationId,
      contactId: existing.contactId,
      providerMessageId: normalized.providerMessageId,
      unreadBump: false,
    });
    return {
      messageId: existing.id,
      conversationId: existing.conversationId,
      contactId: existing.contactId,
      created: false,
    };
  }

  if (
    isCalendarOrInviteEmail({
      subject: normalized.subject,
      snippet: normalized.snippet,
      selectedHeaders: normalized.selectedHeaders,
    })
  ) {
    console.log(
      JSON.stringify({
        tag: "[ContactIdentityAudit]",
        event: "calendar_invite_skipped",
        direction: normalized.direction,
        subjectLen: String(normalized.subject || "").length,
        subjectRedacted: true,
        fromDomain: String(normalized.from.email || "").split("@")[1] || null,
      }),
    );
    return null;
  }

  const { formMeta, replyTarget } = classifyNormalizedInboundEmail({
    normalized,
    mailboxEmail: mailbox.emailAddress,
  });

  const primaryTo = normalized.to[0]?.email || null;
  const identityEmail =
    formMeta?.visitorEmail ||
    (replyTarget.source === "reply_to" &&
    looksLikeNotificationSender(normalized.from.email)
      ? replyTarget.email
      : null);
  const identityName =
    formMeta?.visitorName ||
    (identityEmail ? replyTarget.name : null);

  const inboundText = [
    normalized.subject,
    normalized.textBody,
    normalized.snippet,
  ]
    .filter(Boolean)
    .join("\n");

  const match = await resolveEmailContact({
    workspaceUserId: mailbox.workspaceUserId,
    fromEmail: normalized.from.email,
    fromName: normalized.from.name,
    mailboxEmail: mailbox.emailAddress,
    direction: normalized.direction,
    toEmail: primaryTo,
    identityEmail,
    identityName,
    inboundText,
    isWebsiteForm: Boolean(formMeta),
    isLeadCapture: Boolean(formMeta),
  });

  const bounceLocal = shouldSuppressEmailContactCreation(normalized.from.email);
  if (normalized.direction === "inbound" && bounceLocal) {
    try {
      const { extractBouncedRecipientFromDsn } = await import(
        "@shared/prospectEmailSuppression"
      );
      const { isSystemOrBounceEmail } = await import("@shared/prospectOutreachLifecycle");
      const fromIsSystem = isSystemOrBounceEmail({
        fromEmail: normalized.from.email,
        subject: normalized.subject,
      });
      if (fromIsSystem || bounceLocal === "noreply_or_system") {
        const bounced =
          extractBouncedRecipientFromDsn({
            subject: normalized.subject,
            body: normalized.textBody || normalized.snippet,
            selectedHeaders: normalized.selectedHeaders,
          }) || null;
        if (bounced) {
          const { suppressContactByEmailInWorkspace } = await import(
            "../prospectImport/prospectEmailSuppressionService"
          );
          await suppressContactByEmailInWorkspace({
            workspaceUserId: mailbox.workspaceUserId,
            email: bounced,
            reason: "bounce",
            detail: "inbound_dsn_or_system_bounce",
            source: "persist_inbound_dsn",
          });
        } else {
          console.info(
            JSON.stringify({
              tag: "[EmailPersist]",
              event: "bounce_unattributed",
              reason: bounceLocal,
              note: "DSN detected but recipient not extracted — suppression not written",
            }),
          );
        }
      }
    } catch (err) {
      console.error("[EmailPersist] bounce attribution failed", err);
    }
  }

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

  // Soft-refresh contact display when a form visitor is confidently known.
  if (
    normalized.direction === "inbound" &&
    formMeta?.visitorName &&
    contact.name &&
    (looksLikeNotificationSender(contact.email) ||
      looksLikeNotificationSender(normalized.from.email) ||
      contact.name === normalized.from.name)
  ) {
    try {
      await storage.updateContact(contact.id, {
        name: formMeta.visitorName,
        ...(formMeta.visitorEmail && contact.email !== formMeta.visitorEmail
          ? {}
          : {}),
      } as any);
    } catch {
      /* non-fatal */
    }
  }

  logWebsiteFormClassification({
    workspaceUserId: mailbox.workspaceUserId,
    formMeta,
    replyTarget,
    contactId: contact.id,
    contactDecision: match.kind,
  });

  let conversation = await findEmailConversationByThread({
    workspaceUserId: mailbox.workspaceUserId,
    mailboxId: mailbox.id,
    threadId: normalized.providerThreadId,
  });

  const rawPreview = (normalized.snippet || normalized.textBody || "").slice(0, 100);
  const preview = conversationPreviewForInbound({ formMeta, fallback: rawPreview });

  if (!conversation) {
    const initialUnread = normalized.direction === "inbound" ? 1 : 0;
    conversation = await storage.createConversation({
      userId: mailbox.workspaceUserId,
      contactId: contact.id,
      channel: "email",
      channelAccountId: mailbox.id,
      externalThreadId: normalized.providerThreadId,
      status: "open",
      subject: normalized.subject,
      lastMessageAt: normalized.sentAt,
      lastMessagePreview: preview,
      lastMessageDirection: normalized.direction,
      unreadCount: initialUnread,
    } as any);
    logEmailUnreadDiag("persist_create_conversation_unread", {
      conversationId: conversation.id,
      contactId: contact.id,
      channel: "email",
      direction: normalized.direction,
      unreadCountSet: initialUnread,
      providerThreadId: normalized.providerThreadId,
    });
  } else {
    const beforeUnread = conversation.unreadCount || 0;
    const unread = nextEmailConversationUnreadCount({
      messageAlreadyExists: false,
      direction: normalized.direction,
      currentUnread: beforeUnread,
    });
    await storage.updateConversation(conversation.id, {
      lastMessageAt: normalized.sentAt,
      lastMessagePreview: preview,
      lastMessageDirection: normalized.direction,
      unreadCount: unread,
      subject: conversation.subject || normalized.subject,
    } as any);
    if (unread !== beforeUnread) {
      logEmailUnreadDiag("persist_update_conversation_unread", {
        conversationId: conversation.id,
        contactId: contact.id,
        channel: "email",
        direction: normalized.direction,
        unreadCountBefore: beforeUnread,
        unreadCountAfter: unread,
        providerThreadId: normalized.providerThreadId,
      });
    }
  }

  const rawTextContent =
    normalized.textBody?.trim() ||
    (normalized.htmlBody ? htmlToPlainText(normalized.htmlBody) : "") ||
    normalized.snippet ||
    "";
  const textContent = messageContentForInbound({
    formMeta,
    fallbackText: rawTextContent,
  });

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

  const sanitized = sanitizeEmailHtml(normalized.htmlBody, {
    purpose: "inbound",
    messageId: message.id,
  });
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
    replyToName: normalized.replyTo?.name || null,
    rfcMessageId: normalized.rfcMessageId,
    inReplyTo: normalized.inReplyTo,
    referencesHeader: normalized.references,
    providerThreadId: normalized.providerThreadId,
    snippet: normalized.snippet,
    hasAttachments: normalized.hasAttachments,
    attachmentMetadata: normalized.attachments,
    selectedHeaders: normalized.selectedHeaders || {},
    sourceType: formMeta?.sourceType || null,
    sourceMetadata: formMeta || {},
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
    let inboxNewActivityCount: number | undefined;
    if (normalized.direction === "inbound") {
      const { incrementInboxNewActivity } = await import("../inboxNewActivity");
      inboxNewActivityCount = await incrementInboxNewActivity(mailbox.workspaceUserId, 1);
    }
    notifyUser(mailbox.workspaceUserId, {
      type: "new_message",
      conversationId: conversation.id,
      contactId: contact.id,
      ...(inboxNewActivityCount != null ? { inboxNewActivityCount } : {}),
    });
  }

  if (normalized.direction === "inbound") {
    try {
      const { isProspectEmailUnsubscribeSignal } = await import(
        "@shared/prospectEmailSuppression"
      );
      if (
        isProspectEmailUnsubscribeSignal({
          subject: normalized.subject,
          body: textContent,
          fromEmail: normalized.from.email,
        })
      ) {
        const { applyProspectEmailSuppression } = await import(
          "../prospectImport/prospectEmailSuppressionService"
        );
        await applyProspectEmailSuppression({
          contactId: contact.id,
          reason: "unsubscribe",
          detail: "inbound_unsubscribe_keyword",
          source: "persist_inbound_unsubscribe",
        });
      }
    } catch (err) {
      console.error("[EmailPersist] unsubscribe suppression failed", err);
    }

    try {
      const { isCalendarOrInviteEmail } = await import("@shared/emailChannel");
      const { markProspectOutreachReplied } = await import(
        "../prospectImport/prospectIntelligenceService"
      );
      await markProspectOutreachReplied({
        conversationId: conversation.id,
        contactId: contact.id,
        fromEmail: normalized.from.email,
        subject: normalized.subject,
        direction: "inbound",
        isCalendarOrInvite: isCalendarOrInviteEmail({
          subject: normalized.subject,
          snippet: normalized.snippet,
          selectedHeaders: normalized.selectedHeaders,
        }),
      });
    } catch (err) {
      console.error("[ProspectOutreachLifecycle] reply check failed", err);
    }
  }

  return {
    messageId: message.id,
    conversationId: conversation.id,
    contactId: contact.id,
    created: true,
  };
}
