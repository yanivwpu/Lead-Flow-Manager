/**
 * Message-level Gmail trash + local cleanup.
 * Deletes one Gmail message by exact provider message id — never a whole contact/thread by default.
 */
import { and, desc, eq } from "drizzle-orm";
import { messages, type Message } from "@shared/schema";
import { db } from "../../drizzle/db";
import { storage } from "../storage";
import { getValidMailboxAccessToken } from "./oauth";
import { getEmailProvider } from "./gmailProvider";
import { getEmailMailboxById, getEmailMessageDetail } from "./mailboxStore";
import { htmlToPlainText } from "./htmlSanitize";

export type TrashEmailMessageResult = {
  ok: true;
  messageId: string;
  providerMessageId: string;
  conversationId: string;
  contactId: string;
  conversationDeleted: boolean;
  conversation?: {
    id: string;
    lastMessagePreview: string | null;
    lastMessageAt: string | null;
    lastMessageDirection: string | null;
    unreadCount: number;
    subject: string | null;
  };
};

export class TrashEmailMessageError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "TrashEmailMessageError";
    this.status = status;
    this.code = code;
  }
}

export async function trashEmailMessageByLocalId(params: {
  workspaceUserId: string;
  messageId: string;
}): Promise<TrashEmailMessageResult> {
  const msg = await storage.getMessage(params.messageId);
  if (!msg || msg.userId !== params.workspaceUserId) {
    throw new TrashEmailMessageError(404, "not_found", "Message not found");
  }

  const conversation = await storage.getConversation(msg.conversationId);
  if (!conversation || conversation.userId !== params.workspaceUserId) {
    throw new TrashEmailMessageError(404, "not_found", "Conversation not found");
  }
  if (conversation.channel !== "email") {
    throw new TrashEmailMessageError(400, "not_email", "Only email messages can be trashed this way");
  }

  const providerMessageId = String(msg.externalMessageId || "").trim();
  if (!providerMessageId) {
    throw new TrashEmailMessageError(
      400,
      "missing_gmail_id",
      "This email has no Gmail message id and cannot be moved to Trash",
    );
  }

  const mailboxId = conversation.channelAccountId;
  if (!mailboxId) {
    throw new TrashEmailMessageError(400, "no_mailbox", "Email mailbox is not linked to this conversation");
  }
  const mailbox = await getEmailMailboxById(mailboxId);
  if (!mailbox || mailbox.workspaceUserId !== params.workspaceUserId) {
    throw new TrashEmailMessageError(404, "mailbox_not_found", "Mailbox not found");
  }

  const { accessToken } = await getValidMailboxAccessToken(mailbox.id);
  const provider = getEmailProvider(mailbox.provider);
  if (!provider.trashMessage) {
    throw new TrashEmailMessageError(501, "unsupported", "Trash is not supported for this provider");
  }

  const trashResult = await provider.trashMessage({
    accessToken,
    providerMessageId,
  });
  if (!trashResult.success) {
    const insufficient =
      /insufficient|scope|permission|forbidden/i.test(trashResult.error || "") ||
      /Request had insufficient authentication scopes/i.test(trashResult.error || "");
    throw new TrashEmailMessageError(
      insufficient ? 403 : 502,
      insufficient ? "needs_reconnect_modify_scope" : "gmail_trash_failed",
      insufficient
        ? "Reconnect Gmail in Settings to enable moving emails to Trash."
        : trashResult.error || "Gmail trash failed",
    );
  }

  // Local delete after Gmail Trash succeeds (or already-trashed 404).
  await storage.deleteMessage(msg.id);

  const remaining = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversation.id))
    .orderBy(desc(messages.sentAt), desc(messages.createdAt))
    .limit(1);

  if (remaining.length === 0) {
    await storage.deleteConversation(conversation.id);
    console.log(
      JSON.stringify({
        tag: "[EmailTrash]",
        event: "conversation_removed_empty",
        mailboxId: mailbox.id,
        conversationId: conversation.id,
        messageId: msg.id,
        providerMessageId,
      }),
    );
    return {
      ok: true,
      messageId: msg.id,
      providerMessageId,
      conversationId: conversation.id,
      contactId: conversation.contactId,
      conversationDeleted: true,
    };
  }

  const newest = remaining[0];
  const preview = await buildConversationPreviewFromMessage(newest);
  let unread = conversation.unreadCount || 0;
  if (msg.direction === "inbound" && unread > 0) {
    unread = Math.max(0, unread - 1);
  }

  const updated = await storage.updateConversation(conversation.id, {
    lastMessageAt: newest.sentAt || newest.createdAt || new Date(),
    lastMessagePreview: preview.slice(0, 100),
    lastMessageDirection: newest.direction,
    unreadCount: unread,
  } as any);

  console.log(
    JSON.stringify({
      tag: "[EmailTrash]",
      event: "message_trashed",
      mailboxId: mailbox.id,
      conversationId: conversation.id,
      messageId: msg.id,
      providerMessageId,
      remainingMessages: true,
    }),
  );

  return {
    ok: true,
    messageId: msg.id,
    providerMessageId,
    conversationId: conversation.id,
    contactId: conversation.contactId,
    conversationDeleted: false,
    conversation: {
      id: conversation.id,
      lastMessagePreview: updated?.lastMessagePreview ?? preview.slice(0, 100),
      lastMessageAt: updated?.lastMessageAt
        ? new Date(updated.lastMessageAt).toISOString()
        : newest.sentAt
          ? new Date(newest.sentAt).toISOString()
          : null,
      lastMessageDirection: updated?.lastMessageDirection ?? newest.direction,
      unreadCount: updated?.unreadCount ?? unread,
      subject: updated?.subject ?? conversation.subject ?? null,
    },
  };
}

async function buildConversationPreviewFromMessage(msg: Message): Promise<string> {
  const detail = await getEmailMessageDetail(msg.id);
  const subject = String(detail?.subject || "").trim();
  if (subject) return subject;
  if (detail?.textBody?.trim()) return detail.textBody.trim();
  if (detail?.htmlBody) return htmlToPlainText(detail.htmlBody).trim();
  return String(msg.content || "").trim() || "No messages yet";
}

/** Latest email message id for an inbox conversation row (local messages.id). */
export async function getLatestEmailMessageIdForConversation(
  conversationId: string,
  workspaceUserId: string,
): Promise<string | null> {
  const conv = await storage.getConversation(conversationId);
  if (!conv || conv.userId !== workspaceUserId || conv.channel !== "email") return null;
  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.userId, workspaceUserId)))
    .orderBy(desc(messages.sentAt), desc(messages.createdAt))
    .limit(1);
  return rows[0]?.id ?? null;
}
