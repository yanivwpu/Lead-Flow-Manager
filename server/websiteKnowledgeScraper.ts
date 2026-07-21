/**
 * AI Brain "Website Knowledge" — guided URLs only (no crawling).
 * Fetches each user-provided page independently with SSRF-safe rules, size/time limits,
 * and truncates oversized bodies instead of failing the whole scan.
 */

const FETCH_TIMEOUT_MS = 12_000;
const MAX_BYTES_PER_PAGE = 512 * 1024;
const MAX_COMBINED_TEXT = 95_000;
const MAX_REDIRECTS = 4;

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

/** Read up to maxBytes then stop; never throws for oversized streams. */
async function readBodyTruncating(res: Response, maxBytes: number): Promise<{ buf: Buffer; truncated: boolean }> {
  const reader = res.body?.getReader();
  if (!reader) throw new WebsiteKnowledgeScrapeError("Empty response", "EMPTY");
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    const vb = value.byteLength;
    if (total + vb <= maxBytes) {
      chunks.push(value);
      total += vb;
      continue;
    }
    const allowed = maxBytes - total;
    if (allowed > 0) chunks.push(value.slice(0, allowed));
    truncated = true;
    reader.cancel().catch(() => {});
    break;
  }
  return { buf: Buffer.concat(chunks.map((c) => Buffer.from(c))), truncated };
}

async function fetchHtmlWithSafeRedirects(
  start: URL,
  signal: AbortSignal,
): Promise<{ url: string; html: string; truncated: boolean }> {
  let current = assertSafePublicHttpUrl(start.href);
  let redirects = 0;
  let truncated = false;

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

    const { buf, truncated: bodyTruncated } = await readBodyTruncating(res, MAX_BYTES_PER_PAGE);
    truncated = bodyTruncated;
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
    return { url: current.href, html, truncated };
  }
}

async function fetchSingleKnowledgePage(
  startHref: string,
  signal: AbortSignal,
): Promise<{ finalUrl: string; text: string; truncated: boolean }> {
  const root = assertSafePublicHttpUrl(startHref);
  root.hash = "";
  const { url: finalUrl, html, truncated } = await fetchHtmlWithSafeRedirects(root, signal);
  const text = stripHtmlToText(html, 50_000);
  return { finalUrl, text, truncated };
}

/**
 * Public HTML fetch for Prospect enrichment (SSRF-safe).
 * Returns raw HTML so callers can extract mailto/tel/footer contacts.
 */
export async function fetchPublicHtmlPage(
  startHref: string,
  signal?: AbortSignal,
): Promise<{ finalUrl: string; html: string; truncated: boolean }> {
  const root = assertSafePublicHttpUrl(startHref);
  root.hash = "";
  const controller = signal ? null : new AbortController();
  const active = signal ?? controller!.signal;
  const tid = controller ? setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : null;
  try {
    const { url: finalUrl, html, truncated } = await fetchHtmlWithSafeRedirects(root, active);
    return { finalUrl, html, truncated };
  } finally {
    if (tid) clearTimeout(tid);
  }
}

/** Soft text extract that keeps header/footer (better for public contact pages). */
export function htmlToEnrichmentText(html: string, maxLen = 40_000): string {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
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

export type ScrapedPage = {
  url: string;
  text: string;
  key?: string;
  label?: string;
  truncated?: boolean;
};

export type GuidedPageStatus = "scanned" | "skipped" | "failed";

export type GuidedPageResult = {
  key: string;
  label: string;
  url: string;
  status: GuidedPageStatus;
  reason?: string;
  finalUrl?: string;
  truncated?: boolean;
};

export type GuidedKnowledgeSlot = {
  key: string;
  label: string;
  urlRaw: string;
};

/**
 * Fetch each slot URL independently. Failures and oversize bodies do not stop other pages.
 * Duplicate URLs (after normalization) are skipped after the first successful fetch.
 */
export async function scrapeGuidedWebsiteKnowledgePages(
  slots: GuidedKnowledgeSlot[],
): Promise<{ pages: ScrapedPage[]; results: GuidedPageResult[] }> {
  const results: GuidedPageResult[] = [];
  const pages: ScrapedPage[] = [];
  const seenHref = new Set<string>();

  for (const slot of slots) {
    const raw = slot.urlRaw.trim();
    if (!raw) {
      results.push({
        key: slot.key,
        label: slot.label,
        url: "",
        status: "skipped",
        reason: "No URL provided",
      });
      continue;
    }

    let normalized: string;
    try {
      const u = assertSafePublicHttpUrl(raw);
      normalized = u.href.toLowerCase();
    } catch (e) {
      const msg = e instanceof WebsiteKnowledgeScrapeError ? e.message : "Invalid URL";
      results.push({
        key: slot.key,
        label: slot.label,
        url: raw,
        status: "failed",
        reason: msg,
      });
      continue;
    }

    if (seenHref.has(normalized)) {
      results.push({
        key: slot.key,
        label: slot.label,
        url: raw,
        status: "skipped",
        reason: "Duplicate URL (already scanned)",
      });
      continue;
    }

    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const { finalUrl, text, truncated } = await fetchSingleKnowledgePage(raw, controller.signal);
      seenHref.add(normalized);
      pages.push({
        url: finalUrl,
        text,
        key: slot.key,
        label: slot.label,
        truncated,
      });
      results.push({
        key: slot.key,
        label: slot.label,
        url: raw,
        status: "scanned",
        finalUrl,
        truncated,
      });
    } catch (e) {
      const msg =
        e instanceof Error && e.name === "AbortError"
          ? "Request timed out"
          : e instanceof WebsiteKnowledgeScrapeError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Fetch failed";
      results.push({
        key: slot.key,
        label: slot.label,
        url: raw,
        status: "failed",
        reason: msg,
      });
    } finally {
      clearTimeout(tid);
    }
  }

  return { pages, results };
}

export function combineScrapedText(pages: ScrapedPage[]): string {
  let combined = "";
  for (const p of pages) {
    const header = p.label ? `${p.label} — ${p.url}` : p.url;
    combined += `\n\n--- ${header} ---\n${p.text}`;
    if (combined.length >= MAX_COMBINED_TEXT) return combined.slice(0, MAX_COMBINED_TEXT).trim();
  }
  return combined.trim();
}
