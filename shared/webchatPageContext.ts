/** Sanitized website visitor context persisted on the contact. */

export type WebchatUtm = {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
};

export type WebchatPageContext = {
  landingUrl?: string;
  latestUrl?: string;
  pageTitle?: string;
  referrer?: string;
  utm?: WebchatUtm;
  matchedPageRule?: string;
  firstSeenAt?: string;
  latestSeenAt?: string;
};

const MAX_URL = 2000;
const MAX_TITLE = 300;
const MAX_REFERRER = 2000;
const MAX_UTM = 200;
const MAX_RULE = 500;

function clip(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  if (!t) return undefined;
  return t.slice(0, max);
}

export function parseHttpUrl(raw: string | undefined | null): URL | null {
  const s = (raw || "").trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.username = "";
    u.password = "";
    return u;
  } catch {
    return null;
  }
}

export function extractUtmFromUrl(href: string): WebchatUtm {
  const u = parseHttpUrl(href);
  if (!u) return {};
  const get = (k: string) => clip(u.searchParams.get(k), MAX_UTM);
  const utm: WebchatUtm = {};
  const source = get("utm_source");
  const medium = get("utm_medium");
  const campaign = get("utm_campaign");
  const term = get("utm_term");
  const content = get("utm_content");
  if (source) utm.source = source;
  if (medium) utm.medium = medium;
  if (campaign) utm.campaign = campaign;
  if (term) utm.term = term;
  if (content) utm.content = content;
  return utm;
}

export function sanitizeWebchatPageContextInput(input: {
  parentUrl?: unknown;
  pageTitle?: unknown;
  referrer?: unknown;
  matchedPageRule?: unknown;
}): {
  url?: string;
  origin?: string;
  pageTitle?: string;
  referrer?: string;
  utm: WebchatUtm;
  matchedPageRule?: string;
} {
  const parsed = parseHttpUrl(typeof input.parentUrl === "string" ? input.parentUrl : "");
  const url = parsed ? parsed.toString().slice(0, MAX_URL) : undefined;
  const referrerParsed = parseHttpUrl(typeof input.referrer === "string" ? input.referrer : "");
  return {
    url,
    origin: parsed ? parsed.origin : undefined,
    pageTitle: clip(input.pageTitle, MAX_TITLE),
    referrer: referrerParsed ? referrerParsed.toString().slice(0, MAX_REFERRER) : undefined,
    utm: url ? extractUtmFromUrl(url) : {},
    matchedPageRule: clip(input.matchedPageRule, MAX_RULE),
  };
}

export function mergeWebchatPageContext(
  existing: WebchatPageContext | null | undefined,
  next: ReturnType<typeof sanitizeWebchatPageContextInput>,
  nowIso: string,
): WebchatPageContext {
  const prev = existing && typeof existing === "object" ? existing : {};
  const utm = { ...(prev.utm || {}), ...(next.utm || {}) };
  return {
    landingUrl: prev.landingUrl || next.url,
    latestUrl: next.url || prev.latestUrl,
    pageTitle: next.pageTitle || prev.pageTitle,
    referrer: next.referrer || prev.referrer,
    utm: Object.keys(utm).length ? utm : prev.utm,
    matchedPageRule: next.matchedPageRule || prev.matchedPageRule,
    firstSeenAt: prev.firstSeenAt || nowIso,
    latestSeenAt: nowIso,
  };
}

export function formatPageContextForAi(ctx: WebchatPageContext | null | undefined): string {
  if (!ctx || !ctx.latestUrl) return "";
  const lines = [
    ctx.latestUrl ? `Current page: ${ctx.latestUrl}` : "",
    ctx.landingUrl && ctx.landingUrl !== ctx.latestUrl ? `Landing page: ${ctx.landingUrl}` : "",
    ctx.pageTitle ? `Page title: ${ctx.pageTitle}` : "",
    ctx.matchedPageRule ? `Matched page rule: ${ctx.matchedPageRule}` : "",
    ctx.utm?.campaign ? `UTM campaign: ${ctx.utm.campaign}` : "",
    ctx.utm?.source ? `UTM source: ${ctx.utm.source}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}
