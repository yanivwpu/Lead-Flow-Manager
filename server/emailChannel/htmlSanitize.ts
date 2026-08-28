/**
 * Conservative HTML sanitizer for email bodies.
 *
 * Inbound: strips executable content; rewrites remote images, srcset, HTML background=,
 * and CSS url() to signed same-origin proxy paths; refreshes existing signed proxy URLs;
 * rewrites cid: to same-origin inline paths (when messageId known).
 * Outbound: strips executable content only — leaves remote image URLs intact for recipients.
 */
import {
  EMAIL_IMAGE_PROXY_PATH,
  EMAIL_IMAGE_UNAVAILABLE_PLACEHOLDER,
  EMAIL_TRACKING_PIXEL_PLACEHOLDER,
  buildEmailInlineImagePath,
  decodeEmailProxyUrlPayload,
  decodeHtmlEntitiesInRemoteUrl,
  encodeEmailProxyUrlPayload,
  isEmailImageProxySrc,
  isEmailInlineImageSrc,
  isLikelyTrackingPixelAttrs,
  normalizeEmailContentId,
} from "@shared/emailImagePolicy";
import { buildSignedEmailImageProxyQuery } from "./emailImageProxySecret";

const DANGEROUS_TAGS =
  /<\/?(?:script|iframe|object|embed|form|link|meta|base|svg|math|frame|frameset|template)(?:\s[^>]*)?>/gi;
const EVENT_HANDLER_ATTR = /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const JAVASCRIPT_URL = /(href|src|action|xlink:href)\s*=\s*(["'])\s*javascript:[^"']*\2/gi;
const DATA_URL_SCRIPT = /(href|src)\s*=\s*(["'])\s*data:text\/html[^"']*\2/gi;
const STYLE_EXPRESSION = /expression\s*\(/gi;
const STYLE_URL_JS = /url\s*\(\s*['"]?\s*javascript:/gi;
const CSS_IMPORT = /@import\b[^;]+;/gi;
const CSS_BEHAVIOR = /behavior\s*:[^;}]+/gi;

export type SanitizeEmailHtmlPurpose = "inbound" | "outbound";

export type SanitizeEmailHtmlResult = {
  html: string;
  remoteImagesBlocked: number;
  remoteImagesProxied: number;
  cidImagesRewritten: number;
  trackingPixelsNeutralized: number;
};

export function buildEmailRemoteProxySrc(remoteUrl: string): string {
  const normalized = decodeHtmlEntitiesInRemoteUrl(remoteUrl);
  const u = encodeEmailProxyUrlPayload(normalized);
  const { expiresUnixSec, signature } = buildSignedEmailImageProxyQuery(normalized);
  return `${EMAIL_IMAGE_PROXY_PATH}?u=${encodeURIComponent(u)}&e=${expiresUnixSec}&s=${encodeURIComponent(signature)}`;
}

/** Same as buildEmailRemoteProxySrc, but returns null when signing secret is unavailable. */
export function tryBuildEmailRemoteProxySrc(remoteUrl: string): string | null {
  try {
    return buildEmailRemoteProxySrc(remoteUrl);
  } catch {
    return null;
  }
}

function stripDangerous(html: string): string {
  return html
    .replace(DANGEROUS_TAGS, "")
    .replace(EVENT_HANDLER_ATTR, "")
    .replace(JAVASCRIPT_URL, '$1=""')
    .replace(DATA_URL_SCRIPT, '$1=""')
    .replace(STYLE_EXPRESSION, "")
    .replace(STYLE_URL_JS, "url(")
    .replace(CSS_IMPORT, "")
    .replace(CSS_BEHAVIOR, "");
}

type SanitizeStats = {
  remoteImagesBlocked: number;
  remoteImagesProxied: number;
  cidImagesRewritten: number;
  trackingPixelsNeutralized: number;
};

function shouldRewriteCssImageUrl(url: string): boolean {
  const src = decodeHtmlEntitiesInRemoteUrl(String(url || "").trim());
  if (!src) return false;
  if (/^https?:\/\//i.test(src)) return true;
  if (isEmailImageProxySrc(src)) return true;
  if (/^cid:/i.test(src)) return true;
  return false;
}

function rewriteCssRemoteUrls(
  cssText: string,
  stats: SanitizeStats,
  messageId: string | null,
): string {
  return cssText.replace(
    /url\s*\(\s*(['"]?)([^)'"\s]+)\1\s*\)/gi,
    (full, q: string, url: string) => {
      if (!shouldRewriteCssImageUrl(url)) return full;
      const next = rewriteInboundImageRef(url, stats, messageId, { allowEmpty: true });
      if (!next) return "url('')";
      return `url('${next}')`;
    },
  );
}

function parseProxyQuery(src: string): URLSearchParams | null {
  const decoded = String(src || "").replace(/&amp;/g, "&");
  const q = decoded.indexOf("?");
  if (q < 0) return null;
  try {
    return new URLSearchParams(decoded.slice(q + 1));
  } catch {
    return null;
  }
}

/** Rebuild a signed proxy URL from a stored `u=` payload (refreshes expiry). */
export function refreshEmailImageProxySrc(src: string): string | null {
  const qs = parseProxyQuery(src);
  if (!qs) return null;
  const remote = decodeEmailProxyUrlPayload(qs.get("u") || "");
  if (!remote) return null;
  return tryBuildEmailRemoteProxySrc(remote);
}

/**
 * Rewrite one image URL for inbound rendering: remote HTTPS → signed proxy,
 * existing proxy → freshly signed, cid → inline, tracking pixels → data GIF.
 */
export function rewriteInboundImageRef(
  rawUrl: string,
  stats: SanitizeStats,
  messageId: string | null,
  options?: { allowEmpty?: boolean; treatAsTracking?: boolean },
): string {
  const src = decodeHtmlEntitiesInRemoteUrl(String(rawUrl || "").trim());
  if (!src) return options?.allowEmpty ? "" : src;

  if (options?.treatAsTracking && /^https?:\/\//i.test(src)) {
    stats.trackingPixelsNeutralized += 1;
    return EMAIL_TRACKING_PIXEL_PLACEHOLDER;
  }

  if (isEmailImageProxySrc(src)) {
    const fresh = refreshEmailImageProxySrc(src);
    if (fresh) {
      stats.remoteImagesProxied += 1;
      return fresh;
    }
    stats.remoteImagesBlocked += 1;
    return options?.allowEmpty ? "" : EMAIL_IMAGE_UNAVAILABLE_PLACEHOLDER;
  }

  if (isEmailInlineImageSrc(src)) {
    return src;
  }

  if (/^https?:\/\//i.test(src)) {
    const proxy = tryBuildEmailRemoteProxySrc(src);
    if (!proxy) {
      stats.remoteImagesBlocked += 1;
      return options?.allowEmpty ? "" : EMAIL_IMAGE_UNAVAILABLE_PLACEHOLDER;
    }
    stats.remoteImagesProxied += 1;
    return proxy;
  }

  if (/^cid:/i.test(src)) {
    const cid = normalizeEmailContentId(src);
    if (cid && messageId) {
      stats.cidImagesRewritten += 1;
      return buildEmailInlineImagePath(messageId, cid);
    }
    return src;
  }

  if (/^(data:image\/(png|jpe?g|gif|webp)|blob:)/i.test(src)) {
    return src;
  }

  stats.remoteImagesBlocked += 1;
  return options?.allowEmpty ? "" : EMAIL_IMAGE_UNAVAILABLE_PLACEHOLDER;
}

function rewriteSrcsetValue(
  raw: string,
  stats: SanitizeStats,
  messageId: string | null,
): string {
  const parts = String(raw || "").split(",");
  const out: string[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^(\S+)(\s+.*)?$/);
    if (!match) continue;
    const next = rewriteInboundImageRef(match[1], stats, messageId, { allowEmpty: true });
    if (!next || next === EMAIL_IMAGE_UNAVAILABLE_PLACEHOLDER) continue;
    out.push(`${next}${match[2] || ""}`);
  }
  return out.join(", ");
}

function replaceAttrValue(
  attrs: string,
  attrName: string,
  nextValue: string,
): string {
  const quoted = new RegExp(`\\b${attrName}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i");
  if (quoted.test(attrs)) {
    return attrs.replace(quoted, (_m, q: string) => `${attrName}=${q}${nextValue}${q}`);
  }
  const unquoted = new RegExp(`\\b${attrName}\\s*=\\s*([^\\s>]+)`, "i");
  if (unquoted.test(attrs)) {
    return attrs.replace(unquoted, () => `${attrName}="${nextValue}"`);
  }
  return `${attrs} ${attrName}="${nextValue}"`;
}

function readAttrValue(attrs: string, attrName: string): { value: string; quoted: boolean } | null {
  const quoted = attrs.match(new RegExp(`\\b${attrName}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"));
  if (quoted) return { value: quoted[2], quoted: true };
  const unquoted = attrs.match(new RegExp(`\\b${attrName}\\s*=\\s*([^\\s>]+)`, "i"));
  if (unquoted) return { value: unquoted[1], quoted: false };
  return null;
}

/**
 * @param messageId — when set, cid: images rewrite to authenticated inline endpoint.
 */
export function sanitizeEmailHtml(
  raw: string | null | undefined,
  options?: { purpose?: SanitizeEmailHtmlPurpose; messageId?: string | null },
): SanitizeEmailHtmlResult {
  const purpose = options?.purpose ?? "inbound";
  const messageId = options?.messageId?.trim() || null;
  let html = String(raw || "");
  if (!html.trim()) {
    return {
      html: "",
      remoteImagesBlocked: 0,
      remoteImagesProxied: 0,
      cidImagesRewritten: 0,
      trackingPixelsNeutralized: 0,
    };
  }

  const stats = {
    remoteImagesBlocked: 0,
    remoteImagesProxied: 0,
    cidImagesRewritten: 0,
    trackingPixelsNeutralized: 0,
  };

  if (purpose === "outbound") {
    return {
      html: stripDangerous(html),
      remoteImagesBlocked: 0,
      remoteImagesProxied: 0,
      cidImagesRewritten: 0,
      trackingPixelsNeutralized: 0,
    };
  }

  // <style> blocks: rewrite remote url(...) to proxy (or leave relative alone).
  html = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (block) =>
    rewriteCssRemoteUrls(block, stats, messageId),
  );

  // Inline style="...url(https://...)"
  html = html.replace(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/gi, (_m, q, styleBody: string) => {
    const next = rewriteCssRemoteUrls(styleBody, stats, messageId);
    return `style=${q}${next}${q}`;
  });

  // HTML background="https://..." (newsletter table headers). Quoted and unquoted.
  html = html.replace(/\sbackground\s*=\s*(["'])([\s\S]*?)\1/gi, (_m, q, url: string) => {
    const next = rewriteInboundImageRef(url, stats, messageId, { allowEmpty: true });
    if (!next) return ` background=${q}${q}`;
    return ` background=${q}${next}${q}`;
  });
  html = html.replace(/\sbackground\s*=\s*([^\s>"']+)/gi, (_m, url: string) => {
    const next = rewriteInboundImageRef(url, stats, messageId, { allowEmpty: true });
    if (!next) return ` background=""`;
    return ` background="${next}"`;
  });

  // <img src / srcset>
  html = html.replace(/<img\b([^>]*)>/gi, (_full, attrsRaw: string) => {
    let attrs = String(attrsRaw || "");
    const srcInfo = readAttrValue(attrs, "src");

    if (srcInfo) {
      const src = String(srcInfo.value || "").trim();
      if (isLikelyTrackingPixelAttrs(attrs) && /^https?:\/\//i.test(src)) {
        const next = rewriteInboundImageRef(src, stats, messageId, { treatAsTracking: true });
        attrs = replaceAttrValue(attrs, "src", next);
      } else {
        const next = rewriteInboundImageRef(src, stats, messageId);
        if (next.startsWith("<span")) {
          return next;
        }
        attrs = replaceAttrValue(attrs, "src", next);
      }
    }

    const srcsetInfo = readAttrValue(attrs, "srcset");
    if (srcsetInfo) {
      const nextSrcset = rewriteSrcsetValue(srcsetInfo.value, stats, messageId);
      if (!nextSrcset) {
        attrs = attrs.replace(/\s*srcset\s*=\s*(["'])[\s\S]*?\1/i, "");
        attrs = attrs.replace(/\s*srcset\s*=\s*[^\s>]+/i, "");
      } else {
        attrs = replaceAttrValue(attrs, "srcset", nextSrcset);
      }
    }

    attrs = attrs.replace(/\sonerror\s*=\s*(["'])[\s\S]*?\1/gi, "");
    return `<img${attrs}>`;
  });

  html = stripDangerous(html);

  return { html, ...stats };
}

/** Convert HTML to plain text for AI / previews. */
export function htmlToPlainText(html: string | null | undefined): string {
  let t = String(html || "");
  t = t.replace(/<style[\s\S]*?<\/style>/gi, " ");
  t = t.replace(/<script[\s\S]*?<\/script>/gi, " ");
  t = t.replace(/<br\s*\/?>/gi, "\n");
  t = t.replace(/<\/p>/gi, "\n\n");
  t = t.replace(/<\/div>/gi, "\n");
  t = t.replace(/<\/tr>/gi, "\n");
  t = t.replace(/<[^>]+>/g, " ");
  t = t.replace(/&nbsp;/gi, " ");
  t = t.replace(/&amp;/gi, "&");
  t = t.replace(/&lt;/gi, "<");
  t = t.replace(/&gt;/gi, ">");
  t = t.replace(/&quot;/gi, '"');
  t = t.replace(/&#39;/gi, "'");
  t = t.replace(/[ \t]+\n/g, "\n");
  t = t.replace(/\n{3,}/g, "\n\n");
  t = t.replace(/[ \t]{2,}/g, " ");
  return t.trim();
}

/** Strip common quoted reply blocks for AI context. */
export function stripQuotedEmailReplies(text: string | null | undefined): string {
  const raw = String(text || "");
  if (!raw.trim()) return "";
  const lines = raw.split(/\r?\n/);
  const kept: string[] = [];
  for (const line of lines) {
    if (/^>+/.test(line.trim())) break;
    if (/^On .+ wrote:$/i.test(line.trim())) break;
    if (/^-{2,}\s*Original Message\s*-{2,}$/i.test(line.trim())) break;
    if (/^From:\s+/i.test(line.trim()) && kept.length > 2) break;
    kept.push(line);
  }
  return kept.join("\n").trim();
}
