/**
 * Phase-one Web Chat image policy: JPEG / PNG / WebP only.
 * MIME is decided from file bytes, never from the filename.
 */

export const WEBCHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const WEBCHAT_IMAGE_MAX_PIXELS = 40_000_000;
export const WEBCHAT_VISITOR_UPLOAD_LIMIT_PER_WINDOW = 12;
export const WEBCHAT_VISITOR_UPLOAD_WINDOW_MS = 15 * 60 * 1000;
export const WEBCHAT_MEDIA_GET_LIMIT_VISITOR = 240;
export const WEBCHAT_MEDIA_GET_LIMIT_IP = 4000;
export const WEBCHAT_MEDIA_GET_WINDOW_MS = 15 * 60 * 1000;

export const WEBCHAT_SAFE_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
export type WebchatSafeImageMime = (typeof WEBCHAT_SAFE_IMAGE_MIMES)[number];

const SVG_OR_MARKUP_RE =
  /<\s*(?:svg|html|script|iframe|object|embed|link|meta|form|body|head)\b/i;
const PHP_OR_ASPX_RE = /<\?(?:php|=)|<%|javascript:/i;
const POLY_PDF = Buffer.from("%PDF");
const POLY_MZ = Buffer.from("MZ");
const POLY_ELF = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);

export function sniffWebchatImageMime(buf: Buffer): WebchatSafeImageMime | null {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export function declaredWebchatImageMime(value: unknown): WebchatSafeImageMime | null {
  const raw = String(value || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (raw === "image/jpg") return "image/jpeg";
  if (raw === "image/jpeg" || raw === "image/png" || raw === "image/webp") return raw;
  return null;
}

function looksLikePolyglotOrUnsafe(buf: Buffer): boolean {
  if (buf.length >= 2 && buf.subarray(0, 2).equals(POLY_MZ)) return true;
  if (buf.length >= 4 && buf.subarray(0, 4).equals(POLY_ELF)) return true;
  if (buf.length >= 4 && buf.subarray(0, 4).equals(POLY_PDF)) return true;
  const head = buf.subarray(0, Math.min(buf.length, 512)).toString("utf8");
  const trimmed = head.replace(/^\uFEFF/, "").trimStart();
  if (trimmed.startsWith("<")) return true;
  if (SVG_OR_MARKUP_RE.test(head) || PHP_OR_ASPX_RE.test(head)) return true;
  return false;
}

export type WebchatImageInspection =
  | { ok: true; mime: WebchatSafeImageMime }
  | { ok: false; reason: "empty" | "too_large" | "disguised" | "unsafe_type" | "mismatch" };

export function inspectWebchatImageBuffer(
  buf: Buffer,
  declaredMime?: string | null,
): WebchatImageInspection {
  if (!buf || buf.length === 0) return { ok: false, reason: "empty" };
  if (buf.length > WEBCHAT_IMAGE_MAX_BYTES) return { ok: false, reason: "too_large" };
  if (looksLikePolyglotOrUnsafe(buf)) return { ok: false, reason: "disguised" };
  const sniffed = sniffWebchatImageMime(buf);
  if (!sniffed) return { ok: false, reason: "unsafe_type" };
  const declared = declaredWebchatImageMime(declaredMime);
  if (declared && declared !== sniffed) return { ok: false, reason: "mismatch" };
  if (declaredMime && !declared) {
    const raw = String(declaredMime)
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (raw && raw !== "application/octet-stream" && raw !== "binary/octet-stream") {
      return { ok: false, reason: "unsafe_type" };
    }
  }
  return { ok: true, mime: sniffed };
}

export function webchatVisitorMediaPath(
  widgetPublicId: string,
  visitorId: string,
  messageId: string,
): string {
  return `/api/webchat/${encodeURIComponent(widgetPublicId)}/${encodeURIComponent(visitorId)}/media/${encodeURIComponent(messageId)}`;
}

export function isWebchatImageContentType(contentType: string | null | undefined): boolean {
  const ct = String(contentType || "").trim().toLowerCase();
  return ct === "image" || ct === "image/jpeg" || ct === "image/png" || ct === "image/webp" || ct === "image/jpg";
}
