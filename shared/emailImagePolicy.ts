/**
 * Shared email image rewrite helpers (inbound rendering).
 * Remote images become same-origin proxy URLs; CID becomes same-origin inline URLs.
 * Dangerous HTML stripping lives in server/emailChannel/htmlSanitize.ts.
 */

export const EMAIL_IMAGE_PROXY_PATH = "/api/email/image-proxy";
export const EMAIL_INLINE_IMAGE_PATH_PREFIX = "/api/messages/";

export const EMAIL_SAFE_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

export type EmailSafeImageMime = (typeof EMAIL_SAFE_IMAGE_MIME_TYPES)[number];

export function isEmailSafeImageMime(mime: string | null | undefined): boolean {
  const m = String(mime || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  return (EMAIL_SAFE_IMAGE_MIME_TYPES as readonly string[]).includes(m);
}

/** Normalize cid:foo / <foo> / cid:bar@host → bare content-id. */
export function normalizeEmailContentId(raw: string | null | undefined): string | null {
  let v = String(raw || "").trim();
  if (!v) return null;
  if (/^cid:/i.test(v)) v = v.slice(4);
  v = v.replace(/^<|>$/g, "").trim();
  return v || null;
}

export function isLikelyTrackingPixelAttrs(attrs: string): boolean {
  const a = String(attrs || "");
  const w = a.match(/\bwidth\s*=\s*["']?(\d+)/i);
  const h = a.match(/\bheight\s*=\s*["']?(\d+)/i);
  if (w && h) {
    const wi = Number(w[1]);
    const hi = Number(h[1]);
    if (Number.isFinite(wi) && Number.isFinite(hi) && wi <= 2 && hi <= 2) return true;
  }
  const style = a.match(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/i);
  if (style) {
    const s = style[2];
    const sw = s.match(/\bwidth\s*:\s*(\d+)px/i);
    const sh = s.match(/\bheight\s*:\s*(\d+)px/i);
    if (sw && sh && Number(sw[1]) <= 2 && Number(sh[1]) <= 2) return true;
  }
  return false;
}

/** Tiny transparent GIF — used instead of fetching obvious 1×1 trackers. */
export const EMAIL_TRACKING_PIXEL_PLACEHOLDER =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

export const EMAIL_IMAGE_UNAVAILABLE_PLACEHOLDER =
  '<span data-email-image-unavailable="1" style="display:inline-block;width:48px;height:32px;background:#f3f4f6;border-radius:4px;vertical-align:middle;" title="Image unavailable" aria-hidden="true"></span>';

export function buildEmailInlineImagePath(messageId: string, contentId: string): string {
  const cid = encodeURIComponent(normalizeEmailContentId(contentId) || contentId);
  return `${EMAIL_INLINE_IMAGE_PATH_PREFIX}${encodeURIComponent(messageId)}/email-inline?cid=${cid}`;
}

export function encodeEmailProxyUrlPayload(remoteUrl: string): string {
  return Buffer.from(String(remoteUrl), "utf8").toString("base64url");
}

export function decodeEmailProxyUrlPayload(encoded: string): string | null {
  try {
    const raw = Buffer.from(String(encoded || ""), "base64url").toString("utf8");
    if (!/^https?:\/\//i.test(raw)) return null;
    return raw;
  } catch {
    return null;
  }
}
