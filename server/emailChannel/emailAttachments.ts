/**
 * Secure on-demand fetch for regular (non-CID) email attachments.
 * Authz: user → message → mailbox → attachment metadata on that exact message.
 */
import { and, eq } from "drizzle-orm";
import { conversations, messages } from "@shared/schema";
import type { NormalizedEmailAttachmentMeta } from "@shared/emailChannel";
import {
  isRegularEmailAttachment,
  mayRenderEmailAttachmentInline,
  normalizeAttachmentMime,
  sanitizeEmailAttachmentFilename,
} from "@shared/emailAttachmentPolicy";
import { isEmailSafeImageMime } from "@shared/emailImagePolicy";
import { db } from "../../drizzle/db";
import { getEmailMessageDetail, getEmailMailboxById } from "./mailboxStore";
import { getValidMailboxAccessToken } from "./oauth";
import { getEmailProvider } from "./gmailProvider";

export const EMAIL_ATTACHMENT_MAX_BYTES = Number(
  process.env.EMAIL_ATTACHMENT_MAX_BYTES || 15_000_000,
);

function logAtt(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ tag: "[EmailAttachment]", event, ...fields }));
}

function parseAttachmentMeta(raw: unknown): NormalizedEmailAttachmentMeta[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => x && typeof x === "object") as NormalizedEmailAttachmentMeta[];
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

export type EmailAttachmentFetchResult =
  | {
      ok: true;
      contentType: string;
      body: Buffer;
      filename: string;
      /** Force download vs allow browser inline render */
      asAttachment: boolean;
    }
  | { ok: false; code: string; status: number };

export async function fetchEmailAttachmentForUser(params: {
  workspaceUserId: string;
  messageId: string;
  providerAttachmentId: string;
  /** When true, always send Content-Disposition: attachment */
  forceDownload?: boolean;
}): Promise<EmailAttachmentFetchResult> {
  const providerAttachmentId = String(params.providerAttachmentId || "").trim();
  if (!providerAttachmentId) {
    return { ok: false, code: "invalid_attachment_id", status: 400 };
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
    logAtt("denied", { reason: "message_not_found" });
    return { ok: false, code: "not_found", status: 404 };
  }
  if (row.channel !== "email" || !row.channelAccountId || !row.externalMessageId) {
    return { ok: false, code: "not_email", status: 400 };
  }

  const mailbox = await getEmailMailboxById(row.channelAccountId);
  if (!mailbox || mailbox.workspaceUserId !== params.workspaceUserId) {
    logAtt("denied", { reason: "mailbox_forbidden" });
    return { ok: false, code: "forbidden", status: 403 };
  }

  const detail = await getEmailMessageDetail(params.messageId);
  if (!detail) {
    return { ok: false, code: "not_found", status: 404 };
  }

  const attachments = parseAttachmentMeta(detail.attachmentMetadata);
  const match = attachments.find(
    (a) => String(a.providerAttachmentId || "") === providerAttachmentId,
  );

  if (!match) {
    logAtt("denied", { reason: "attachment_not_on_message" });
    return { ok: false, code: "attachment_mismatch", status: 404 };
  }

  // Regular attachment endpoint must not be used as a CID bypass for arbitrary parts,
  // but we allow download of any metadata-listed part that belongs to this message.
  // Prefer regular attachments; still allow listed non-inline files.
  if (match.isInline && match.contentId && !params.forceDownload) {
    // Inline CID images should use /email-inline; still allow explicit download.
  }

  if (!isRegularEmailAttachment(match) && !(match.providerAttachmentId && match.filename)) {
    // Fail closed for empty/unknown metadata rows
    if (!match.filename && match.contentId) {
      logAtt("denied", { reason: "use_inline_endpoint" });
      return { ok: false, code: "use_inline_endpoint", status: 400 };
    }
  }

  if (typeof match.size === "number" && match.size > EMAIL_ATTACHMENT_MAX_BYTES) {
    logAtt("oversized_meta", { size: match.size });
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
      logAtt("fetch_empty", {});
      return { ok: false, code: "fetch_failed", status: 502 };
    }
    if (att.data.length > EMAIL_ATTACHMENT_MAX_BYTES) {
      logAtt("oversized_body", { bytes: att.data.length });
      return { ok: false, code: "oversized", status: 413 };
    }

    let contentType = normalizeAttachmentMime(att.mimeType || match.mimeType || "application/octet-stream");
    if (!contentType || contentType === "application/octet-stream") {
      const sniffed = sniffImageMime(att.data);
      if (sniffed) contentType = sniffed;
      else if (!contentType) contentType = "application/octet-stream";
    }

    // Never treat SVG / XML as safe inline
    if (
      contentType === "image/svg+xml" ||
      contentType.includes("svg") ||
      contentType === "text/html" ||
      contentType === "application/xhtml+xml"
    ) {
      contentType =
        contentType === "image/svg+xml" || contentType.includes("svg")
          ? "image/svg+xml"
          : "application/octet-stream";
    }

    const filename = sanitizeEmailAttachmentFilename(match.filename);
    const canInline =
      !params.forceDownload &&
      mayRenderEmailAttachmentInline(contentType) &&
      contentType !== "image/svg+xml";

    // Re-check image allowlist for inline image responses
    if (canInline && contentType.startsWith("image/") && !isEmailSafeImageMime(contentType)) {
      logAtt("rejected_inline_mime", { contentType: contentType.slice(0, 40) });
      return {
        ok: true,
        contentType: "application/octet-stream",
        body: att.data,
        filename,
        asAttachment: true,
      };
    }

    logAtt("ok", {
      bytes: att.data.length,
      contentType,
      asAttachment: !canInline,
      regular: isRegularEmailAttachment(match),
    });

    return {
      ok: true,
      contentType: canInline ? contentType : contentType || "application/octet-stream",
      body: att.data,
      filename,
      asAttachment: !canInline || !!params.forceDownload,
    };
  } catch (err) {
    logAtt("failed", {
      errorName: err instanceof Error ? err.name : "Error",
    });
    return { ok: false, code: "fetch_failed", status: 502 };
  }
}
