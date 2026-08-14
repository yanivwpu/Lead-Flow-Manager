/**
 * Isolate untrusted email HTML so embedded CSS/JS cannot affect the host app.
 * Used to build iframe srcdoc documents (sandbox without allow-scripts).
 */

const DANGEROUS_TAGS =
  /<\/?(?:script|iframe|object|embed|form|link|meta|base|svg|math|frame|frameset|template)(?:\s[^>]*)?>/gi;
const EVENT_HANDLER_ATTR = /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const JAVASCRIPT_URL = /(href|src|action|xlink:href)\s*=\s*(["'])\s*javascript:[^"']*\2/gi;
const DATA_URL_SCRIPT = /(href|src)\s*=\s*(["'])\s*data:text\/html[^"']*\2/gi;
const STYLE_EXPRESSION = /expression\s*\(/gi;
const STYLE_URL_JS = /url\s*\(\s*['"]?\s*javascript:/gi;
const CSS_IMPORT = /@import\b[^;]+;/gi;
const CSS_BEHAVIOR = /behavior\s*:[^;}]+/gi;

/**
 * Flatten a full HTML email document into a fragment: preserve `<style>` from `<head>`,
 * use `<body>` inner HTML when present. Avoids nested html/body inside srcdoc.
 */
export function unwrapEmailHtmlDocument(raw: string): string {
  const html = String(raw || "");
  if (!/<html[\s>]/i.test(html) && !/<body[\s>]/i.test(html)) return html;

  const allStyles = [...html.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)].map((m) => m[0]);
  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    const bodyInner = bodyMatch[1];
    const bodyStyles = new Set(
      [...bodyInner.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)].map((m) => m[0]),
    );
    const headOnlyStyles = allStyles.filter((s) => !bodyStyles.has(s)).join("\n");
    return `${headOnlyStyles}\n${bodyInner}`.trim();
  }
  if (allStyles.length > 0) {
    return `${allStyles.join("\n")}\n${html}`.trim();
  }
  return html;
}

/** Defense-in-depth strip before placing markup into an isolated document. */
export function hardenEmailHtmlForFrame(raw: string | null | undefined): string {
  let html = unwrapEmailHtmlDocument(String(raw || ""));
  if (!html.trim()) return "";

  html = html
    .replace(DANGEROUS_TAGS, "")
    .replace(EVENT_HANDLER_ATTR, "")
    .replace(JAVASCRIPT_URL, '$1=""')
    .replace(DATA_URL_SCRIPT, '$1=""')
    .replace(STYLE_EXPRESSION, "")
    .replace(STYLE_URL_JS, "url(")
    .replace(CSS_IMPORT, "")
    .replace(CSS_BEHAVIOR, "");

  // Ensure anchors open safely when clicked inside the frame.
  html = html.replace(/<a\b([^>]*)>/gi, (_match, attrs: string) => {
    let next = String(attrs || "");
    if (!/\btarget\s*=/i.test(next)) {
      next += ' target="_blank"';
    }
    if (!/\brel\s*=/i.test(next)) {
      next += ' rel="noopener noreferrer"';
    } else if (!/noopener/i.test(next) || !/noreferrer/i.test(next)) {
      next = next.replace(/\brel\s*=\s*(["'])([^"']*)\1/i, (_m, q, val) => {
        const parts = new Set(
          String(val)
            .split(/\s+/)
            .map((p: string) => p.trim().toLowerCase())
            .filter(Boolean),
        );
        parts.add("noopener");
        parts.add("noreferrer");
        return `rel=${q}${[...parts].join(" ")}${q}`;
      });
    }
    return `<a${next}>`;
  });

  return html;
}

/**
 * Full HTML document for iframe srcdoc.
 * Email `<style>` blocks stay inside this document only — they cannot style the host UI.
 */
export function buildIsolatedEmailSrcDoc(rawHtml: string | null | undefined): string {
  const body = hardenEmailHtmlForFrame(rawHtml);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data: blob:; style-src 'unsafe-inline'; font-src https: http: data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none';" />
<base target="_blank" />
<style>
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #1f2937;
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  img, video { max-width: 100%; height: auto; }
  table { max-width: 100%; }
  a { color: #1d4ed8; }
  pre, code { white-space: pre-wrap; word-break: break-word; }
</style>
</head>
<body>${body}</body>
</html>`;
}

/** True when markup contains CSS that would leak if injected into the host document. */
export function emailHtmlHasHostLeakingStyles(raw: string | null | undefined): boolean {
  const html = String(raw || "");
  if (/<style[\s>]/i.test(html)) return true;
  if (/<link\b[^>]*rel\s*=\s*["']?stylesheet/i.test(html)) return true;
  // Unscoped global rules sometimes appear via style attributes on html/body — still host-safe
  // when framed; flag style tags / stylesheet links as the primary leak vector.
  return false;
}
