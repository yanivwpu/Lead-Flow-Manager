/**
 * Conservative HTML sanitizer for email bodies.
 * Blocks scripts, event handlers, javascript: URLs, iframes, and remote images by default.
 */
const DANGEROUS_TAGS =
  /<\/?(?:script|iframe|object|embed|form|link|meta|base|svg|math|frame|frameset)(?:\s[^>]*)?>/gi;
const EVENT_HANDLER_ATTR = /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const JAVASCRIPT_URL = /(href|src|action|xlink:href)\s*=\s*(["'])\s*javascript:[^"']*\2/gi;
const DATA_URL_SCRIPT = /(href|src)\s*=\s*(["'])\s*data:text\/html[^"']*\2/gi;
const REMOTE_IMG = /<img\b[^>]*\bsrc\s*=\s*(["'])https?:\/\/[^"']*\1[^>]*>/gi;
const STYLE_EXPRESSION = /expression\s*\(/gi;
const STYLE_URL_JS = /url\s*\(\s*['"]?\s*javascript:/gi;

export type SanitizeEmailHtmlResult = {
  html: string;
  remoteImagesBlocked: number;
};

export function sanitizeEmailHtml(raw: string | null | undefined): SanitizeEmailHtmlResult {
  let html = String(raw || "");
  if (!html.trim()) return { html: "", remoteImagesBlocked: 0 };

  let remoteImagesBlocked = 0;
  html = html.replace(REMOTE_IMG, () => {
    remoteImagesBlocked += 1;
    return `<span data-remote-image-blocked="1" style="display:inline-block;padding:4px 8px;background:#f3f4f6;color:#6b7280;font-size:12px;border-radius:4px;">[Remote image blocked]</span>`;
  });

  html = html
    .replace(DANGEROUS_TAGS, "")
    .replace(EVENT_HANDLER_ATTR, "")
    .replace(JAVASCRIPT_URL, '$1=""')
    .replace(DATA_URL_SCRIPT, '$1=""')
    .replace(STYLE_EXPRESSION, "")
    .replace(STYLE_URL_JS, "url(");

  return { html, remoteImagesBlocked };
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
