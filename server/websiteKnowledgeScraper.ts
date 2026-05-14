/**
 * V1 public website fetch + text extraction for AI Brain "Website Knowledge".
 * Not a crawler — bounded pages, SSRF-safe URL rules, size/time limits.
 */

const FETCH_TIMEOUT_MS = 12_000;
const MAX_BYTES_PER_PAGE = 512 * 1024;
const MAX_PAGES = 5;
const MAX_COMBINED_TEXT = 95_000;
const MAX_REDIRECTS = 4;

const PATH_HINTS =
  /(products?|services?|faq|shipping|returns?|return-policy|contact|support)(\/|$)/i;

const USER_AGENT = "WhachatCRM-WebsiteKnowledge/1.0 (+https://whachatcrm.com)";

export class WebsiteKnowledgeScrapeError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "WebsiteKnowledgeScrapeError";
  }
}

function isBlockedHostname(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!h || h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "0.0.0.0") return true;

  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    return false;
  }

  if (h.includes(":")) {
    const hl = h.replace(/^\[|\]$/g, "").toLowerCase();
    if (hl === "::1") return true;
    if (hl.startsWith("fe80:")) return true;
    if (hl.startsWith("fc") || hl.startsWith("fd")) return true;
  }
  return false;
}

export function assertSafePublicHttpUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new WebsiteKnowledgeScrapeError("Invalid URL", "INVALID_URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new WebsiteKnowledgeScrapeError("Only http and https URLs are allowed", "INVALID_PROTOCOL");
  }
  if (isBlockedHostname(u.hostname)) {
    throw new WebsiteKnowledgeScrapeError("This host is not allowed", "BLOCKED_HOST");
  }
  if (!u.hostname.includes(".")) {
    throw new WebsiteKnowledgeScrapeError("Host is not allowed", "BLOCKED_HOST");
  }
  u.hash = "";
  return u;
}

function stripHtmlToText(html: string, maxLen: number): string {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");
  s = s
    .replace(/\s+/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
  return s.slice(0, maxLen);
}

async function readBodyWithCap(res: Response, maxBytes: number): Promise<Buffer> {
  const reader = res.body?.getReader();
  if (!reader) throw new WebsiteKnowledgeScrapeError("Empty response", "EMPTY");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        reader.cancel().catch(() => {});
        throw new WebsiteKnowledgeScrapeError("Page too large", "TOO_LARGE");
      }
      chunks.push(value);
    }
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

async function fetchHtmlWithSafeRedirects(start: URL, signal: AbortSignal): Promise<{ url: string; html: string }> {
  let current = assertSafePublicHttpUrl(start.href);
  let redirects = 0;

  for (;;) {
    const res = await fetch(current.href, {
      method: "GET",
      redirect: "manual",
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "User-Agent": USER_AGENT,
      },
      signal,
    });

    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      if (redirects++ >= MAX_REDIRECTS) {
        throw new WebsiteKnowledgeScrapeError("Too many redirects", "TOO_MANY_REDIRECTS");
      }
      const next = new URL(res.headers.get("location")!, current);
      assertSafePublicHttpUrl(next.href);
      current = next;
      current.hash = "";
      continue;
    }

    if (!res.ok) {
      throw new WebsiteKnowledgeScrapeError(`HTTP ${res.status}`, "HTTP_ERROR");
    }
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("text/html") && !ct.includes("application/xhtml")) {
      throw new WebsiteKnowledgeScrapeError("Response is not HTML", "NOT_HTML");
    }

    const buf = await readBodyWithCap(res, MAX_BYTES_PER_PAGE);
    const charsetMatch = /charset=([^;"\s]+)/i.exec(ct);
    const charset = charsetMatch?.[1]?.replace(/['"]/g, "") || "utf-8";
    let html: string;
    try {
      const dec = new TextDecoder(charset.toLowerCase() === "utf8" ? "utf-8" : charset, {
        fatal: false,
      });
      html = dec.decode(buf);
    } catch {
      html = buf.toString("utf-8");
    }
    return { url: current.href, html };
  }
}

async function fetchTextPage(url: URL, signal: AbortSignal): Promise<{ url: string; text: string }> {
  const { url: finalUrl, html } = await fetchHtmlWithSafeRedirects(url, signal);
  return { url: finalUrl, text: stripHtmlToText(html, 50_000) };
}

function extractSameOriginHintLinks(base: URL, html: string): string[] {
  const out: string[] = [];
  const re = /href\s*=\s*["']([^"'#]+)["']/gi;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = re.exec(html))) {
    let href = m[1].trim();
    if (!href || href.startsWith("javascript:") || href.startsWith("mailto:")) continue;
    let abs: URL;
    try {
      abs = new URL(href, base);
    } catch {
      continue;
    }
    if (abs.protocol !== "http:" && abs.protocol !== "https:") continue;
    if (abs.hostname.toLowerCase() !== base.hostname.toLowerCase()) continue;
    if (isBlockedHostname(abs.hostname)) continue;
    abs.hash = "";
    const path = abs.pathname + (abs.search || "");
    if (!PATH_HINTS.test(path)) continue;
    const key = abs.href;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(abs.href);
  }
  return out;
}

export type ScrapedPage = { url: string; text: string };

export async function scrapeWebsiteKnowledgePages(startUrl: string): Promise<ScrapedPage[]> {
  const root = assertSafePublicHttpUrl(startUrl);
  root.hash = "";

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const { url: firstUrl, html } = await fetchHtmlWithSafeRedirects(root, controller.signal);
    const firstParsed = new URL(firstUrl);
    const mainText = stripHtmlToText(html, 50_000);
    const pages: ScrapedPage[] = [{ url: firstUrl, text: mainText }];

    const extra = extractSameOriginHintLinks(firstParsed, html);
    const toVisit: string[] = [];
    for (const u of extra) {
      if (toVisit.length >= MAX_PAGES - 1) break;
      if (u === firstUrl) continue;
      toVisit.push(u);
    }

    for (const href of toVisit) {
      if (pages.length >= MAX_PAGES) break;
      const u = assertSafePublicHttpUrl(href);
      const c2 = new AbortController();
      const t2 = setTimeout(() => c2.abort(), FETCH_TIMEOUT_MS);
      try {
        const p = await fetchTextPage(u, c2.signal);
        pages.push(p);
      } catch {
        /* skip failed auxiliary pages */
      } finally {
        clearTimeout(t2);
      }
    }

    return pages;
  } finally {
    clearTimeout(tid);
  }
}

export function combineScrapedText(pages: ScrapedPage[]): string {
  let combined = "";
  for (const p of pages) {
    combined += `\n\n--- ${p.url} ---\n${p.text}`;
    if (combined.length >= MAX_COMBINED_TEXT) return combined.slice(0, MAX_COMBINED_TEXT).trim();
  }
  return combined.trim();
}
