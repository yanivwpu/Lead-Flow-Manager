/**
 * Resolve cid: inline images from Gmail message attachments (on demand).
 */
import { and, eq } from "drizzle-orm";
import { conversations, messages } from "@shared/schema";
import { isEmailSafeImageMime, normalizeEmailContentId } from "@shared/emailImagePolicy";
import type { NormalizedEmailAttachmentMeta } from "@shared/emailChannel";
import { db } from "../../drizzle/db";
import { getEmailMessageDetail, getEmailMailboxById } from "./mailboxStore";
import { getValidMailboxAccessToken } from "./oauth";
import { getEmailProvider } from "./gmailProvider";

export const EMAIL_INLINE_MAX_BYTES = Number(process.env.EMAIL_INLINE_MAX_BYTES || 2_000_000);

function logInline(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ tag: "[EmailInlineImage]", event, ...fields }));
}

export type EmailInlineImageResult =
  | { ok: true; contentType: string; body: Buffer }
  | { ok: false; code: string; status: number };

function parseAttachmentMeta(raw: unknown): NormalizedEmailAttachmentMeta[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => x && typeof x === "object") as NormalizedEmailAttachmentMeta[];
}

export async function fetchEmailInlineImageForUser(params: {
  workspaceUserId: string;
  messageId: string;
  contentId: string;
}): Promise<EmailInlineImageResult> {
  const cid = normalizeEmailContentId(params.contentId);
  if (!cid) {
    return { ok: false, code: "invalid_cid", status: 400 };
  }

  const rows = await db
    .select({
      messageId: messages.id,
      userId: messages.userId,
      externalMessageId: messages.externalMessageId,
      conversationId: messages.conversationId,
      channel: conversations.channel,
      channelAccountId: conversations.channelAccountId,
    })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(and(eq(messages.id, params.messageId), eq(messages.userId, params.workspaceUserId)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    logInline("denied", { reason: "message_not_found" });
    return { ok: false, code: "not_found", status: 404 };
  }
  if (row.channel !== "email" || !row.channelAccountId || !row.externalMessageId) {
    return { ok: false, code: "not_email", status: 400 };
  }

  const mailbox = await getEmailMailboxById(row.channelAccountId);
  if (!mailbox || mailbox.workspaceUserId !== params.workspaceUserId) {
    logInline("denied", { reason: "mailbox_forbidden" });
    return { ok: false, code: "forbidden", status: 403 };
  }

  const detail = await getEmailMessageDetail(params.messageId);
  const attachments = parseAttachmentMeta(detail?.attachmentMetadata);
  const match = attachments.find((a) => {
    const aCid = normalizeEmailContentId(a.contentId || null);
    return aCid && aCid.toLowerCase() === cid.toLowerCase();
  });

  if (!match?.providerAttachmentId) {
    logInline("missing_attachment", { cidLen: cid.length });
    return { ok: false, code: "missing_attachment", status: 404 };
  }

  if (match.mimeType && !isEmailSafeImageMime(match.mimeType) && !String(match.mimeType).startsWith("image/")) {
    // Allow image/* that we'll re-check after fetch; reject obvious non-images early.
    if (!String(match.mimeType).toLowerCase().startsWith("image/")) {
      logInline("rejected_mime", { mime: String(match.mimeType).slice(0, 40) });
      return { ok: false, code: "content_type", status: 415 };
    }
  }

  if (typeof match.size === "number" && match.size > EMAIL_INLINE_MAX_BYTES) {
    logInline("oversized_meta", { size: match.size });
    return { ok: false, code: "oversized", status: 413 };
  }

  try {
    const { accessToken } = await getValidMailboxAccessToken(mailbox.id);
    const provider = getEmailProvider(mailbox.provider);
    if (!provider.getAttachment) {
      return { ok: false, code: "unsupported", status: 501 };
    }
    const att = await provider.getAttachment({
      accessToken,
      providerMessageId: row.externalMessageId,
      providerAttachmentId: match.providerAttachmentId,
    });
    if (!att?.data) {
      logInline("fetch_empty", {});
      return { ok: false, code: "fetch_failed", status: 502 };
    }
    if (att.data.length > EMAIL_INLINE_MAX_BYTES) {
      logInline("oversized_body", { bytes: att.data.length });
      return { ok: false, code: "oversized", status: 413 };
    }
    const contentType = String(att.mimeType || match.mimeType || "application/octet-stream")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!isEmailSafeImageMime(contentType)) {
      // Gmail sometimes returns application/octet-stream for jpeg — sniff magic bytes.
      const sniffed = sniffImageMime(att.data);
      if (!sniffed) {
        logInline("rejected_content_type", { contentType: contentType.slice(0, 40) });
        return { ok: false, code: "content_type", status: 415 };
      }
      logInline("ok", { bytes: att.data.length, contentType: sniffed });
      return { ok: true, contentType: sniffed, body: att.data };
    }
    logInline("ok", { bytes: att.data.length, contentType });
    return { ok: true, contentType, body: att.data };
  } catch (err) {
    logInline("failed", {
      errorName: err instanceof Error ? err.name : "Error",
    });
    return { ok: false, code: "fetch_failed", status: 502 };
  }
}

function sniffImageMime(buf: Buffer): string | null {
  if (buf.length < 4) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

// Re-export type alias used above — keep compile happy if image policy re-exports later.
export type { NormalizedEmailAttachmentMeta };
