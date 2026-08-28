/**
 * Shared email image rewrite helpers (inbound rendering).
 * Remote images become same-origin proxy URLs; CID becomes same-origin inline URLs.
 * Dangerous HTML stripping lives in server/emailChannel/htmlSanitize.ts.
 */

export const EMAIL_IMAGE_PROXY_PATH = "/api/email/image-proxy";
export const EMAIL_INLINE_IMAGE_PATH_PREFIX = "/api/messages/";

/**
 * Explicit HTTPS origins allowed in the isolated email iframe `img-src`.
 * Must stay a finite allowlist — never `https:` or `*`.
 * Covers apex → www → app 307s of `/api/email/image-proxy` and `/email-inline`.
 */
export const EMAIL_IMAGE_TRUSTED_ORIGINS = [
  "https://app.whachatcrm.com",
  "https://www.whachatcrm.com",
  "https://whachatcrm.com",
] as const;

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

/**
 * Decode HTML entities that appear in email HTML URL attributes (`src`, CSS `url()`).
 * Only ampersand entities — does not percent-decode, so `%26amp%3B` stays intact.
 * Idempotent for already-decoded `https://…?a=1&b=2` URLs.
 */
export function decodeHtmlEntitiesInRemoteUrl(raw: string): string {
  let v = String(raw || "");
  for (let i = 0; i < 2; i++) {
    const next = v
      .replace(/&amp;/gi, "&")
      .replace(/&#0*38;/g, "&")
      .replace(/&#x0*26;/gi, "&");
    if (next === v) break;
    v = next;
  }
  return v;
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

export function pathnameWithoutQuery(raw: string): string {
  return String(raw || "").split("?")[0] || "";
}

/** True for the inbound image proxy and CID inline endpoints (same Express app on every host). */
export function isEmailImageRequestPath(pathname: string): boolean {
  const path = pathnameWithoutQuery(pathname);
  if (path === EMAIL_IMAGE_PROXY_PATH) return true;
  return /^\/api\/messages\/[^/]+\/email-inline$/i.test(path);
}

export function isEmailImageProxySrc(src: string): boolean {
  const path = pathnameWithoutQuery(String(src || "").trim().replace(/&amp;/g, "&"));
  if (path === EMAIL_IMAGE_PROXY_PATH) return true;
  if (path.endsWith(EMAIL_IMAGE_PROXY_PATH)) return true;
  try {
    const u = new URL(path, "https://app.whachatcrm.com");
    return u.pathname === EMAIL_IMAGE_PROXY_PATH;
  } catch {
    return false;
  }
}

export function isEmailInlineImageSrc(src: string): boolean {
  const path = pathnameWithoutQuery(String(src || "").trim().replace(/&amp;/g, "&"));
  return /\/api\/messages\/[^/]+\/email-inline$/i.test(path);
}

function tryParseOrigin(raw: string): string | null {
  try {
    const u = new URL(String(raw || "").trim());
    if (u.username || u.password || u.search || u.hash) return null;
    if (u.pathname && u.pathname !== "/") return null;
    return u.origin;
  } catch {
    return null;
  }
}

function isLoopbackEmailImageCspHostname(hostname: string): boolean {
  const host = String(hostname || "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

/**
 * Origins allowed in email-frame `img-src`. Finite production allowlist plus
 * loopback (local verification). Never `https:` / `*` wildcards, never arbitrary HTTPS.
 */
export function isAllowedEmailImageCspOrigin(origin: string): boolean {
  const parsed = tryParseOrigin(origin);
  if (!parsed) return false;
  if ((EMAIL_IMAGE_TRUSTED_ORIGINS as readonly string[]).includes(parsed)) return true;
  try {
    const u = new URL(parsed);
    if (!isLoopbackEmailImageCspHostname(u.hostname)) return false;
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function collectEmailFrameImageOrigins(
  extra: Array<string | null | undefined> = [],
): string[] {
  const set = new Set<string>();
  for (const origin of EMAIL_IMAGE_TRUSTED_ORIGINS) {
    if (isAllowedEmailImageCspOrigin(origin)) set.add(origin);
  }
  for (const raw of extra) {
    if (!raw) continue;
    const origin = tryParseOrigin(raw.includes("://") ? raw : `https://${raw}`) || tryParseOrigin(raw);
    if (origin && isAllowedEmailImageCspOrigin(origin)) set.add(origin);
  }
  return [...set];
}

export function buildEmailFrameImgSrcDirective(extraOrigins: Array<string | null | undefined> = []): string {
  const origins = collectEmailFrameImageOrigins(extraOrigins);
  return ["'self'", "data:", "blob:", ...origins].join(" ");
}

/** Full CSP for isolated email srcdoc. No `https:` / `*` image wildcards. */
export function buildEmailFrameContentSecurityPolicy(
  extraOrigins: Array<string | null | undefined> = [],
): string {
  const imgSrc = buildEmailFrameImgSrcDirective(extraOrigins);
  return `default-src 'none'; img-src ${imgSrc}; style-src 'unsafe-inline'; font-src https: http: data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none';`;
}
