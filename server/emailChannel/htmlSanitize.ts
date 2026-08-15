/**
 * Conservative HTML sanitizer for email bodies.
 *
 * Inbound: strips executable content; rewrites remote images + CSS url() to same-origin
 * proxy paths; rewrites cid: to same-origin inline paths (when messageId known).
 * Outbound: strips executable content only — leaves remote image URLs intact for recipients.
 */
import {
  EMAIL_IMAGE_PROXY_PATH,
  EMAIL_IMAGE_UNAVAILABLE_PLACEHOLDER,
  EMAIL_TRACKING_PIXEL_PLACEHOLDER,
  buildEmailInlineImagePath,
  decodeHtmlEntitiesInRemoteUrl,
  encodeEmailProxyUrlPayload,
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

function rewriteCssRemoteUrls(
  cssText: string,
  stats: { remoteImagesProxied: number; remoteImagesBlocked: number },
): string {
  return cssText.replace(
    /url\s*\(\s*(['"]?)(https?:\/\/[^)'"\s]+)\1\s*\)/gi,
    (_m, _q, url: string) => {
      const proxy = tryBuildEmailRemoteProxySrc(url);
      if (!proxy) {
        stats.remoteImagesBlocked += 1;
        return "url('')";
      }
      stats.remoteImagesProxied += 1;
      return `url('${proxy}')`;
    },
  );
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
    rewriteCssRemoteUrls(block, stats),
  );

  // Inline style="...url(https://...)"
  html = html.replace(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/gi, (_m, q, styleBody: string) => {
    const next = rewriteCssRemoteUrls(styleBody, stats);
    return `style=${q}${next}${q}`;
  });

  // <img src="...">
  html = html.replace(/<img\b([^>]*)>/gi, (_full, attrsRaw: string) => {
    let attrs = String(attrsRaw || "");
    const srcMatch = attrs.match(/\bsrc\s*=\s*(["'])([\s\S]*?)\1/i);
    if (!srcMatch) return `<img${attrs}>`;

    const quote = srcMatch[1];
    const src = String(srcMatch[2] || "").trim();

    if (isLikelyTrackingPixelAttrs(attrs) && /^https?:\/\//i.test(src)) {
      stats.trackingPixelsNeutralized += 1;
      attrs = attrs.replace(srcMatch[0], `src=${quote}${EMAIL_TRACKING_PIXEL_PLACEHOLDER}${quote}`);
      return `<img${attrs}>`;
    }

    if (/^https?:\/\//i.test(src)) {
      const proxy = tryBuildEmailRemoteProxySrc(src);
      if (!proxy) {
        stats.remoteImagesBlocked += 1;
        return EMAIL_IMAGE_UNAVAILABLE_PLACEHOLDER;
      }
      stats.remoteImagesProxied += 1;
      attrs = attrs.replace(srcMatch[0], `src=${quote}${proxy}${quote}`);
      // Drop onerror that might probe remote hosts.
      attrs = attrs.replace(/\sonerror\s*=\s*(["'])[\s\S]*?\1/gi, "");
      return `<img${attrs}>`;
    }

    if (/^cid:/i.test(src)) {
      const cid = normalizeEmailContentId(src);
      if (cid && messageId) {
        stats.cidImagesRewritten += 1;
        const inlineSrc = buildEmailInlineImagePath(messageId, cid);
        attrs = attrs.replace(srcMatch[0], `src=${quote}${inlineSrc}${quote}`);
        return `<img${attrs}>`;
      }
      // Keep cid until messageId is known (second pass).
      return `<img${attrs}>`;
    }

    if (/^(data:image\/(png|jpe?g|gif|webp)|blob:)/i.test(src)) {
      return `<img${attrs}>`;
    }

    // Already rewritten to same-origin proxy / CID endpoints — keep.
    if (
      src.startsWith(EMAIL_IMAGE_PROXY_PATH) ||
      /\/api\/messages\/[^/]+\/email-inline\?/i.test(src) ||
      src.startsWith("/api/email/image-proxy")
    ) {
      return `<img${attrs}>`;
    }

    // Unknown / unsafe schemes — neutralize without noisy [Remote image blocked] labels.
    stats.remoteImagesBlocked += 1;
    return EMAIL_IMAGE_UNAVAILABLE_PLACEHOLDER;
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
