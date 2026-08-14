/**
 * Regular (non-CID) email attachment helpers — distinct from inline CID and remote proxy images.
 */
import type { NormalizedEmailAttachmentMeta } from "./emailChannel";
import { isEmailSafeImageMime } from "./emailImagePolicy";

export const EMAIL_ATTACHMENT_PATH_SUFFIX = "/email-attachment";

/** Preview-inline MIME types for authenticated attachment responses. */
export const EMAIL_ATTACHMENT_INLINE_IMAGE_MIMES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

export function normalizeAttachmentMime(mime: string | null | undefined): string {
  return String(mime || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

/**
 * Regular file attachments shown outside the HTML body.
 * Excludes CID/inline MIME parts (those render inside the body via email-inline).
 */
export function isRegularEmailAttachment(
  att: NormalizedEmailAttachmentMeta | null | undefined,
): boolean {
  if (!att?.providerAttachmentId) return false;
  if (att.isInline) return false;
  const cid = String(att.contentId || "").trim();
  if (cid) return false;
  const filename = String(att.filename || "").trim();
  return filename.length > 0;
}

export function listRegularEmailAttachments(
  raw: unknown,
): NormalizedEmailAttachmentMeta[] {
  if (!Array.isArray(raw)) return [];
  return (raw as NormalizedEmailAttachmentMeta[]).filter(isRegularEmailAttachment);
}

export function isEmailAttachmentInlinePreviewMime(mime: string | null | undefined): boolean {
  const m = normalizeAttachmentMime(mime);
  if (m === "image/svg+xml" || (m.includes("svg") && m.includes("xml"))) return false;
  return isEmailSafeImageMime(m);
}

export function isEmailAttachmentPdfMime(mime: string | null | undefined): boolean {
  return normalizeAttachmentMime(mime) === "application/pdf";
}

/** True when the browser may render the bytes inline (img/iframe/object). */
export function mayRenderEmailAttachmentInline(mime: string | null | undefined): boolean {
  return isEmailAttachmentInlinePreviewMime(mime) || isEmailAttachmentPdfMime(mime);
}

export function buildEmailAttachmentPath(
  messageId: string,
  providerAttachmentId: string,
  opts?: { download?: boolean },
): string {
  const qs = new URLSearchParams({
    attachmentId: providerAttachmentId,
  });
  if (opts?.download) qs.set("download", "1");
  return `/api/messages/${encodeURIComponent(messageId)}${EMAIL_ATTACHMENT_PATH_SUFFIX}?${qs.toString()}`;
}

export function formatEmailAttachmentSize(bytes: number | null | undefined): string | null {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10_240 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10_485_760 ? 1 : 0)} MB`;
}

export function emailAttachmentFileKind(
  mime: string | null | undefined,
  filename?: string | null,
): "image" | "pdf" | "document" | "other" {
  if (isEmailAttachmentInlinePreviewMime(mime)) return "image";
  if (isEmailAttachmentPdfMime(mime)) return "pdf";
  const name = String(filename || "").toLowerCase();
  if (/\.(pdf)$/i.test(name)) return "pdf";
  if (/\.(png|jpe?g|gif|webp)$/i.test(name) && !/\.svg$/i.test(name)) return "image";
  if (/\.(docx?|xlsx?|pptx?|txt|csv|zip)$/i.test(name)) return "document";
  const m = normalizeAttachmentMime(mime);
  if (m.startsWith("text/") || m.includes("officedocument") || m.includes("msword")) return "document";
  return "other";
}

export function sanitizeEmailAttachmentFilename(name: string | null | undefined): string {
  const cleaned = String(name || "attachment")
    .replace(/[\r\n\0"]/g, "_")
    .replace(/[<>:\\|?*]/g, "_")
    .trim()
    .slice(0, 180);
  return cleaned || "attachment";
}
